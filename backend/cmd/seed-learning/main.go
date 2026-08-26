package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"zeno-backend/internal/learningseed"
	"zeno-backend/internal/store"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL wajib diisi")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	database, err := store.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer database.Close()
	rows, err := learningseed.Load()
	if err != nil {
		log.Fatalf("validate learning seed: %v", err)
	}
	if err := database.SeedLearningMaterials(ctx, rows); err != nil {
		log.Fatalf("seed learning materials: %v", err)
	}
	published := 0
	for _, row := range rows {
		if row.Published {
			published++
		}
	}
	fmt.Printf("Seeded %d learning material rows (%d published)\n", len(rows), published)
}
