package store

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"strings"
	"zeno-backend/internal/model"
)

const moduleColumns = `id::text, owner_user_id::text, title, category, level, objective, note, created_at`

func scanModule(row pgx.Row) (model.LearningModule, error) {
	var v model.LearningModule
	v.Materials = []model.ModuleMaterial{}
	err := row.Scan(&v.ID, &v.OwnerUserID, &v.Title, &v.Category, &v.Level, &v.Objective, &v.Note, &v.CreatedAt)
	return v, err
}
func (p *Postgres) moduleMaterials(ctx context.Context, v *model.LearningModule) error {
	rows, err := p.pool.Query(ctx, `SELECT id::text,kind,title,body,url,file_name,mime_type,byte_size,sort_order FROM manual_learning_materials WHERE module_id=$1::uuid ORDER BY sort_order,id`, v.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var m model.ModuleMaterial
		if err = rows.Scan(&m.ID, &m.Type, &m.Title, &m.Body, &m.URL, &m.FileName, &m.MimeType, &m.ByteSize, &m.SortOrder); err != nil {
			return err
		}
		v.Materials = append(v.Materials, m)
	}
	return rows.Err()
}
func (p *Postgres) CreateLearningModule(ctx context.Context, v model.LearningModule) (model.LearningModule, error) {
	out, err := scanModule(p.pool.QueryRow(ctx, `INSERT INTO manual_learning_modules(id,owner_user_id,title,category,level,objective,note,created_at) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) RETURNING `+moduleColumns, v.ID, v.OwnerUserID, v.Title, v.Category, v.Level, v.Objective, v.Note, v.CreatedAt))
	return out, err
}
func (p *Postgres) ListLearningModules(ctx context.Context, scope model.LearningScope) ([]model.LearningModule, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+moduleColumns+` FROM manual_learning_modules WHERE ($2::boolean OR owner_user_id=$1::uuid) ORDER BY created_at DESC,id DESC`, scope.OwnerUserID, scope.AllOwners)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.LearningModule{}
	for rows.Next() {
		v, e := scanModule(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if err = p.moduleMaterials(ctx, &out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}
func (p *Postgres) GetLearningModule(ctx context.Context, id string, scope model.LearningScope) (model.LearningModule, bool, error) {
	v, err := scanModule(p.pool.QueryRow(ctx, `SELECT `+moduleColumns+` FROM manual_learning_modules WHERE id=$1::uuid AND ($3::boolean OR owner_user_id=$2::uuid)`, id, scope.OwnerUserID, scope.AllOwners))
	if errors.Is(err, pgx.ErrNoRows) {
		return v, false, nil
	}
	if err != nil {
		return v, false, err
	}
	err = p.moduleMaterials(ctx, &v)
	return v, err == nil, err
}
func (p *Postgres) UpdateLearningModule(ctx context.Context, v model.LearningModule, scope model.LearningScope) (model.LearningModule, bool, error) {
	out, err := scanModule(p.pool.QueryRow(ctx, `UPDATE manual_learning_modules SET title=$3,category=$4,level=$5,objective=$6,note=$7 WHERE id=$1::uuid AND ($8::boolean OR owner_user_id=$2::uuid) RETURNING `+moduleColumns, v.ID, scope.OwnerUserID, v.Title, v.Category, v.Level, v.Objective, v.Note, scope.AllOwners))
	if errors.Is(err, pgx.ErrNoRows) {
		return out, false, nil
	}
	if err != nil {
		return out, false, err
	}
	err = p.moduleMaterials(ctx, &out)
	return out, err == nil, err
}
func (p *Postgres) DeleteLearningModule(ctx context.Context, id string, scope model.LearningScope) (bool, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM manual_learning_modules WHERE id=$1::uuid AND ($3::boolean OR owner_user_id=$2::uuid)`, id, scope.OwnerUserID, scope.AllOwners)
	return tag.RowsAffected() > 0, err
}
func (p *Postgres) CreateModuleMaterial(ctx context.Context, module string, scope model.LearningScope, m model.ModuleMaterial, data []byte) (model.ModuleMaterial, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return m, false, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `INSERT INTO manual_learning_materials(id,module_id,kind,title,body,url,file_name,mime_type,byte_size,sort_order) SELECT $1::uuid,m.id,$4,$5,$6,$7,$8,$9,$10,$11 FROM manual_learning_modules m WHERE m.id=$2::uuid AND ($12::boolean OR m.owner_user_id=$3::uuid) RETURNING id::text`, m.ID, module, scope.OwnerUserID, m.Type, m.Title, m.Body, m.URL, m.FileName, m.MimeType, m.ByteSize, m.SortOrder, scope.AllOwners).Scan(&m.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, false, nil
	}
	if err != nil {
		return m, false, err
	}
	if data != nil {
		_, err = tx.Exec(ctx, `INSERT INTO manual_learning_files(material_id,data) VALUES($1::uuid,$2)`, m.ID, data)
		if err != nil {
			return m, false, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return m, false, err
	}
	return m, true, nil
}
func (p *Postgres) GetModuleFile(ctx context.Context, module, material string, scope model.LearningScope) (model.ModuleMaterial, []byte, bool, error) {
	var m model.ModuleMaterial
	var data []byte
	err := p.pool.QueryRow(ctx, `SELECT a.id::text,a.kind,a.title,a.body,a.url,a.file_name,a.mime_type,a.byte_size,a.sort_order,f.data FROM manual_learning_modules m JOIN manual_learning_materials a ON a.module_id=m.id JOIN manual_learning_files f ON f.material_id=a.id WHERE m.id=$1::uuid AND a.id=$2::uuid AND ($4::boolean OR m.owner_user_id=$3::uuid)`, module, material, scope.OwnerUserID, scope.AllOwners).Scan(&m.ID, &m.Type, &m.Title, &m.Body, &m.URL, &m.FileName, &m.MimeType, &m.ByteSize, &m.SortOrder, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, nil, false, nil
	}
	return m, data, err == nil, err
}

func (p *Postgres) UpdateModuleMaterial(ctx context.Context, module, material string, scope model.LearningScope, m model.ModuleMaterial) (model.ModuleMaterial, bool, bool, error) {
	var out model.ModuleMaterial
	// The kind predicate makes the immutable type check part of the write itself.
	err := p.pool.QueryRow(ctx, `UPDATE manual_learning_materials a SET title=$5, body=$6, url=$7, sort_order=$8
		FROM manual_learning_modules mod WHERE a.id=$2::uuid AND a.module_id=mod.id AND mod.id=$1::uuid
		AND ($9::boolean OR mod.owner_user_id=$3::uuid) AND a.kind=$4
		RETURNING a.id::text,a.kind,a.title,a.body,a.url,a.file_name,a.mime_type,a.byte_size,a.sort_order`,
		module, material, scope.OwnerUserID, m.Type, m.Title, m.Body, m.URL, m.SortOrder, scope.AllOwners).Scan(&out.ID, &out.Type, &out.Title, &out.Body, &out.URL, &out.FileName, &out.MimeType, &out.ByteSize, &out.SortOrder)
	if err == nil {
		return out, true, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return out, false, false, err
	}
	var found bool
	err = p.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM manual_learning_materials a JOIN manual_learning_modules mod ON mod.id=a.module_id WHERE mod.id=$1::uuid AND a.id=$2::uuid AND ($4::boolean OR mod.owner_user_id=$3::uuid))`, module, material, scope.OwnerUserID, scope.AllOwners).Scan(&found)
	return out, found, false, err
}

func (p *Postgres) DeleteModuleMaterial(ctx context.Context, module, material string, scope model.LearningScope) (bool, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return false, false, err
	}
	defer tx.Rollback(ctx)
	// Session writes hold a KEY SHARE lock on their material until commit.
	// The exclusive row lock closes the check/delete race with those writers.
	var found bool
	err = tx.QueryRow(ctx, `SELECT true FROM manual_learning_materials a JOIN manual_learning_modules mod ON mod.id=a.module_id WHERE mod.id=$1::uuid AND a.id=$2::uuid AND ($4::boolean OR mod.owner_user_id=$3::uuid) FOR UPDATE OF a`, module, material, scope.OwnerUserID, scope.AllOwners).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	var referenced bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM manual_learning_sessions s WHERE s.module_id=$1::uuid AND
		(EXISTS(SELECT 1 FROM jsonb_array_elements(s.planned_items) item WHERE (item->>'materialId')::uuid=$2::uuid)
		 OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.actual_items) item WHERE (item->>'materialId')::uuid=$2::uuid)))`, module, material).Scan(&referenced)
	if err != nil || referenced {
		return true, referenced, err
	}
	_, err = tx.Exec(ctx, `DELETE FROM manual_learning_materials a USING manual_learning_modules mod WHERE a.id=$2::uuid AND a.module_id=mod.id AND mod.id=$1::uuid AND ($4::boolean OR mod.owner_user_id=$3::uuid)`, module, material, scope.OwnerUserID, scope.AllOwners)
	if err != nil {
		return true, false, err
	}
	return true, false, tx.Commit(ctx)
}

const sessionColumns = `id::text,owner_user_id::text,module_id::text,session_date::text,title,target_minutes,method,objective,practice_plan,status,planned_items,actual_items,actual_minutes,reflection,confusion,next_step,COALESCE(review_date::text,''),created_at`

func scanLearningSession(row pgx.Row) (model.LearningSession, error) {
	var v model.LearningSession
	var planned, actual []byte
	err := row.Scan(&v.ID, &v.OwnerUserID, &v.ModuleID, &v.Date, &v.Title, &v.TargetMinutes, &v.Method, &v.Objective, &v.PracticePlan, &v.Status, &planned, &actual, &v.ActualMinutes, &v.Reflection, &v.Confusion, &v.NextStep, &v.ReviewDate, &v.CreatedAt)
	if err == nil {
		err = json.Unmarshal(planned, &v.PlannedItems)
	}
	if err == nil {
		err = json.Unmarshal(actual, &v.ActualItems)
	}
	return v, err
}
func sessionArgs(v model.LearningSession) ([]any, error) {
	planned, err := json.Marshal(v.PlannedItems)
	if err != nil {
		return nil, err
	}
	actual, err := json.Marshal(v.ActualItems)
	if err != nil {
		return nil, err
	}
	var review any
	if v.ReviewDate != "" {
		review = v.ReviewDate
	}
	return []any{v.ID, v.OwnerUserID, v.ModuleID, v.Date, v.Title, v.TargetMinutes, v.Method, v.Objective, v.PracticePlan, v.Status, planned, actual, v.ActualMinutes, v.Reflection, v.Confusion, v.NextStep, review, v.CreatedAt}, nil
}
func (p *Postgres) validPortions(ctx context.Context, tx pgx.Tx, v model.LearningSession) (bool, error) {
	if v.Status == "completed" && strings.TrimSpace(v.Reflection) == "" {
		return false, nil
	}
	for _, part := range append(append([]model.LearningPortion{}, v.PlannedItems...), v.ActualItems...) {
		var ok bool
		err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM manual_learning_materials a JOIN manual_learning_modules m ON m.id=a.module_id WHERE a.id=$1::uuid AND a.module_id=$2::uuid AND m.owner_user_id=$3::uuid FOR KEY SHARE OF a)`, part.MaterialID, v.ModuleID, v.OwnerUserID).Scan(&ok)
		if err != nil || !ok {
			return false, err
		}
	}
	return true, nil
}
func (p *Postgres) CreateLearningSession(ctx context.Context, v model.LearningSession, scope model.LearningScope) (model.LearningSession, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return v, false, err
	}
	defer tx.Rollback(ctx)
	// A session inherits the module owner, including when created by an admin.
	err = tx.QueryRow(ctx, `SELECT owner_user_id::text FROM manual_learning_modules WHERE id=$1::uuid AND ($3::boolean OR owner_user_id=$2::uuid) FOR KEY SHARE`, v.ModuleID, scope.OwnerUserID, scope.AllOwners).Scan(&v.OwnerUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, false, nil
	}
	if err != nil {
		return v, false, err
	}
	ok, err := p.validPortions(ctx, tx, v)
	if err != nil || !ok {
		return v, false, err
	}
	args, err := sessionArgs(v)
	if err != nil {
		return v, false, err
	}
	out, err := scanLearningSession(tx.QueryRow(ctx, `INSERT INTO manual_learning_sessions(id,owner_user_id,module_id,session_date,title,target_minutes,method,objective,practice_plan,status,planned_items,actual_items,actual_minutes,reflection,confusion,next_step,review_date,created_at) SELECT $1::uuid,$2::uuid,m.id,$4::date,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17::date,$18 FROM manual_learning_modules m WHERE m.id=$3::uuid AND m.owner_user_id=$2::uuid RETURNING `+sessionColumns, args...))
	if errors.Is(err, pgx.ErrNoRows) {
		return out, false, nil
	}
	if err != nil {
		return out, false, err
	}
	err = tx.Commit(ctx)
	return out, err == nil, err
}
func (p *Postgres) ListLearningSessions(ctx context.Context, scope model.LearningScope) ([]model.LearningSession, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+sessionColumns+` FROM manual_learning_sessions WHERE ($2::boolean OR owner_user_id=$1::uuid) ORDER BY session_date DESC,created_at DESC,id DESC`, scope.OwnerUserID, scope.AllOwners)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.LearningSession{}
	for rows.Next() {
		v, e := scanLearningSession(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (p *Postgres) GetLearningSession(ctx context.Context, id string, scope model.LearningScope) (model.LearningSession, bool, error) {
	v, err := scanLearningSession(p.pool.QueryRow(ctx, `SELECT `+sessionColumns+` FROM manual_learning_sessions WHERE id=$1::uuid AND ($3::boolean OR owner_user_id=$2::uuid)`, id, scope.OwnerUserID, scope.AllOwners))
	if errors.Is(err, pgx.ErrNoRows) {
		return v, false, nil
	}
	return v, err == nil, err
}
func (p *Postgres) UpdateLearningSession(ctx context.Context, v model.LearningSession, scope model.LearningScope) (model.LearningSession, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return v, false, err
	}
	defer tx.Rollback(ctx)
	// Resolve the existing owner under lock. Neither payload nor actor can transfer ownership.
	var owner string
	err = tx.QueryRow(ctx, `SELECT owner_user_id::text FROM manual_learning_sessions WHERE id=$1::uuid AND ($3::boolean OR owner_user_id=$2::uuid) FOR UPDATE`, v.ID, scope.OwnerUserID, scope.AllOwners).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, false, nil
	}
	if err != nil {
		return v, false, err
	}
	v.OwnerUserID = owner
	ok, err := p.validPortions(ctx, tx, v)
	if err != nil || !ok {
		return v, false, err
	}
	args, err := sessionArgs(v)
	if err != nil {
		return v, false, err
	}
	out, err := scanLearningSession(tx.QueryRow(ctx, `UPDATE manual_learning_sessions s SET module_id=$3::uuid,session_date=$4::date,title=$5,target_minutes=$6,method=$7,objective=$8,practice_plan=$9,status=$10,planned_items=$11::jsonb,actual_items=$12::jsonb,actual_minutes=$13,reflection=$14,confusion=$15,next_step=$16,review_date=$17::date WHERE s.id=$1::uuid AND s.owner_user_id=$2::uuid AND EXISTS(SELECT 1 FROM manual_learning_modules m WHERE m.id=$3::uuid AND m.owner_user_id=s.owner_user_id) RETURNING `+sessionColumns, args[:17]...))
	if errors.Is(err, pgx.ErrNoRows) {
		return out, false, nil
	}
	if err != nil {
		return out, false, err
	}
	err = tx.Commit(ctx)
	return out, err == nil, err
}
