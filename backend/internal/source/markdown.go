package source

import (
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"zeno-backend/internal/model"
)

var (
	sectionPattern  = regexp.MustCompile(`(?m)^## \d+\.`)
	questionPattern = regexp.MustCompile(`(?s)### Pertanyaan\n(.*?)(?:\n### Jawaban|$)`)
	answerPattern   = regexp.MustCompile(`(?s)### Jawaban\n(.*)$`)
	markdownMarks   = regexp.MustCompile("[`*_>#-]")
	spaces          = regexp.MustCompile(`\s+`)
	successPattern  = regexp.MustCompile(`(?i)berhasil|aktif|terverifikasi|terhubung|dapat mengirim`)
)

type Reader struct{ path string }

func New(path string) *Reader { return &Reader{path: path} }

func (r *Reader) Logs() ([]model.Log, model.SourceMeta, error) {
	content, err := os.ReadFile(r.path)
	if err != nil {
		return nil, model.SourceMeta{}, err
	}
	info, err := os.Stat(r.path)
	if err != nil {
		return nil, model.SourceMeta{}, err
	}
	text := string(content)
	indices := sectionPattern.FindAllStringIndex(text, -1)
	logs := make([]model.Log, 0, len(indices))
	for index, position := range indices {
		end := len(text)
		if index+1 < len(indices) {
			end = indices[index+1][0]
		}
		part := text[position[0]+3 : end]
		lines := strings.Split(strings.TrimSpace(part), "\n")
		if len(lines) == 0 {
			continue
		}
		title := strings.TrimSpace(lines[0])
		body := strings.TrimSpace(strings.Join(lines[1:], "\n"))
		question := capture(questionPattern, body)
		answer := capture(answerPattern, body)
		if answer == "" {
			answer = body
		}
		plain := spaces.ReplaceAllString(markdownMarks.ReplaceAllString(answer, " "), " ")
		status := "info"
		if successPattern.MatchString(answer) {
			status = "success"
		}
		logs = append(logs, model.Log{ID: index + 1, Title: title, Question: question, Answer: answer, Excerpt: truncate(strings.TrimSpace(plain), 180), Status: status})
	}
	return logs, model.SourceMeta{SourceFile: r.path, ModifiedAt: info.ModTime().UTC()}, nil
}

func capture(pattern *regexp.Regexp, value string) string {
	match := pattern.FindStringSubmatch(value)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func truncate(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:limit]) + "…"
}
