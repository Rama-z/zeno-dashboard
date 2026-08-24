package mailer

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var ErrNotConfigured = errors.New("email provider belum dikonfigurasi")

type Sender interface {
	SendVerification(context.Context, string, string, string) error
}

type Disabled struct{}

func (Disabled) SendVerification(context.Context, string, string, string) error {
	return ErrNotConfigured
}

type Resend struct {
	apiKey   string
	from     string
	endpoint string
	client   *http.Client
}

func NewResend(apiKey, from, endpoint string) *Resend {
	if endpoint == "" {
		endpoint = "https://api.resend.com/emails"
	}
	return &Resend{apiKey: apiKey, from: from, endpoint: endpoint, client: &http.Client{Timeout: 15 * time.Second}}
}

func (r *Resend) SendVerification(ctx context.Context, to, displayName, verificationURL string) error {
	if r.apiKey == "" || r.from == "" {
		return ErrNotConfigured
	}
	if _, err := mail.ParseAddress(to); err != nil {
		return fmt.Errorf("invalid recipient: %w", err)
	}
	subject, textBody, htmlBody := verificationMessage(displayName, verificationURL)
	payload := map[string]any{
		"from": r.from, "to": []string{to}, "subject": subject, "text": textBody, "html": htmlBody,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+r.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := r.client.Do(request)
	if err != nil {
		return fmt.Errorf("send Resend email: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("Resend returned %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	return nil
}

type SMTP struct {
	host, port, username, password, from string
}

func NewSMTP(host, port, username, password, from string) *SMTP {
	return &SMTP{host: host, port: port, username: username, password: password, from: from}
}

func (s *SMTP) SendVerification(ctx context.Context, to, displayName, verificationURL string) error {
	if s.host == "" || s.port == "" || s.from == "" {
		return ErrNotConfigured
	}
	fromAddress, err := mail.ParseAddress(s.from)
	if err != nil {
		return fmt.Errorf("invalid SMTP from: %w", err)
	}
	toAddress, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("invalid SMTP recipient: %w", err)
	}
	subject, textBody, htmlBody := verificationMessage(displayName, verificationURL)
	boundary := "zeno-verification-boundary"
	message := strings.Join([]string{
		"From: " + s.from,
		"To: " + toAddress.Address,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: multipart/alternative; boundary=" + boundary,
		"",
		"--" + boundary,
		"Content-Type: text/plain; charset=UTF-8",
		"",
		textBody,
		"--" + boundary,
		"Content-Type: text/html; charset=UTF-8",
		"",
		htmlBody,
		"--" + boundary + "--",
	}, "\r\n")
	address := net.JoinHostPort(s.host, s.port)
	connection, err := (&net.Dialer{Timeout: 15 * time.Second}).DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("dial SMTP: %w", err)
	}
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(20 * time.Second))
	client, err := smtp.NewClient(connection, s.host)
	if err != nil {
		return fmt.Errorf("create SMTP client: %w", err)
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); !ok {
		return errors.New("SMTP server tidak mendukung STARTTLS")
	}
	if err := client.StartTLS(&tls.Config{ServerName: s.host, MinVersion: tls.VersionTLS12}); err != nil {
		return fmt.Errorf("start SMTP TLS: %w", err)
	}
	if s.username != "" {
		if err := client.Auth(smtp.PlainAuth("", s.username, s.password, s.host)); err != nil {
			return fmt.Errorf("SMTP auth: %w", err)
		}
	}
	if err := client.Mail(fromAddress.Address); err != nil {
		return fmt.Errorf("SMTP MAIL FROM: %w", err)
	}
	if err := client.Rcpt(toAddress.Address); err != nil {
		return fmt.Errorf("SMTP RCPT TO: %w", err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA: %w", err)
	}
	if _, err := writer.Write([]byte(message)); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write SMTP message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close SMTP DATA: %w", err)
	}
	return client.Quit()
}

type File struct{ dir string }

func NewFile(dir string) *File { return &File{dir: dir} }

var safeFilename = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func (f *File) SendVerification(_ context.Context, to, displayName, verificationURL string) error {
	if f.dir == "" {
		return ErrNotConfigured
	}
	if err := os.MkdirAll(f.dir, 0o700); err != nil {
		return err
	}
	random := make([]byte, 6)
	if _, err := rand.Read(random); err != nil {
		return err
	}
	subject, textBody, htmlBody := verificationMessage(displayName, verificationURL)
	filename := fmt.Sprintf("%d-%s-%s.eml", time.Now().UTC().UnixNano(), safeFilename.ReplaceAllString(to, "_"), hex.EncodeToString(random))
	content := fmt.Sprintf("To: %s\nSubject: %s\n\n%s\n\nHTML:\n%s\n", to, subject, textBody, htmlBody)
	return os.WriteFile(filepath.Join(f.dir, filename), []byte(content), 0o600)
}

func verificationMessage(displayName, verificationURL string) (string, string, string) {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "pengguna Zeno"
	}
	subject := "Verifikasi email Zeno"
	textBody := fmt.Sprintf("Halo %s,\n\nVerifikasi email Anda untuk mengaktifkan akun Zeno:\n%s\n\nTautan ini berlaku selama 24 jam. Jika Anda tidak mendaftar, abaikan email ini.", name, verificationURL)
	htmlBody := fmt.Sprintf(`<!doctype html><html><body style="background:#F6F9FC;color:#0A1628;font-family:Arial,sans-serif;padding:32px"><div style="max-width:560px;margin:auto;background:#FFFFFF;border:1px solid #D6E2EE;border-radius:14px;padding:28px"><h1 style="margin:0 0 16px;color:#0878E8">Verifikasi email Zeno</h1><p>Halo %s,</p><p>Verifikasi email Anda untuk mengaktifkan akun Zeno.</p><p style="margin:26px 0"><a href="%s" style="display:inline-block;background:#0878E8;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:8px">Verifikasi email</a></p><p style="color:#52677C;font-size:13px">Tautan ini berlaku selama 24 jam. Jika Anda tidak mendaftar, abaikan email ini.</p></div></body></html>`, html.EscapeString(name), html.EscapeString(verificationURL))
	return subject, textBody, htmlBody
}
