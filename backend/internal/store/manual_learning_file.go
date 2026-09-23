package store

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"strings"
	"zeno-backend/internal/model"
)

// PutModuleFile replaces a file only on a material of matching type in a module accessible by scope.
func (p *Postgres) PutModuleFile(ctx context.Context, module, material string, scope model.LearningScope, kindName string, data []byte) (model.ModuleMaterial, bool, error) {
	parts := strings.SplitN(kindName, ":", 2)
	if len(parts) != 2 {
		return model.ModuleMaterial{}, false, errors.New("invalid file type")
	}
	mimeType := "application/pdf"
	if parts[0] == "video" {
		mimeType = "video/mp4"
		if strings.HasSuffix(strings.ToLower(parts[1]), ".webm") {
			mimeType = "video/webm"
		}
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.ModuleMaterial{}, false, err
	}
	defer tx.Rollback(ctx)
	var m model.ModuleMaterial
	err = tx.QueryRow(ctx, `UPDATE manual_learning_materials a SET file_name=$4,mime_type=$5,byte_size=$6 FROM manual_learning_modules mod WHERE a.id=$2::uuid AND a.module_id=mod.id AND mod.id=$1::uuid AND ($8::boolean OR mod.owner_user_id=$3::uuid) AND a.kind=$7 RETURNING a.id::text,a.kind,a.title,a.body,a.url,a.file_name,a.mime_type,a.byte_size,a.sort_order`, module, material, scope.OwnerUserID, parts[1], mimeType, len(data), parts[0], scope.AllOwners).Scan(&m.ID, &m.Type, &m.Title, &m.Body, &m.URL, &m.FileName, &m.MimeType, &m.ByteSize, &m.SortOrder)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, false, nil
	}
	if err != nil {
		return m, false, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO manual_learning_files(material_id,data) VALUES($1::uuid,$2) ON CONFLICT(material_id) DO UPDATE SET data=EXCLUDED.data`, material, data)
	if err != nil {
		return m, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return m, false, err
	}
	return m, true, nil
}
