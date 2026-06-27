using Dapper;

namespace Backend.Data;

// Idempotent schema bootstrap run once at startup, replacing ORM migrations. A fresh clone
// gets its schema with no manual steps, and the file-backed DB persists across restarts.
public static class DatabaseInitializer
{
    public const int MaxTitleLength = 200;

    private const string Schema = @"
CREATE TABLE IF NOT EXISTS Users (
    Id           TEXT NOT NULL PRIMARY KEY,
    Email        TEXT NOT NULL,
    PasswordHash TEXT NOT NULL,
    CreatedAt    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_Users_Email ON Users(Email);

CREATE TABLE IF NOT EXISTS Tasks (
    Id          TEXT NOT NULL PRIMARY KEY,
    UserId      TEXT NOT NULL,
    Title       TEXT NOT NULL,
    Description TEXT NULL,
    DueDateUtc  TEXT NULL,
    IsCompleted INTEGER NOT NULL DEFAULT 0,
    CreatedAt   TEXT NOT NULL,
    UpdatedAt   TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
);
-- Backs keyset pagination ordered by (CreatedAt, Id) within a user.
CREATE INDEX IF NOT EXISTS IX_Tasks_UserId_CreatedAt_Id ON Tasks(UserId, CreatedAt, Id);
";

    public static void Initialize(ConnectionFactory factory)
    {
        using var connection = factory.Create();
        connection.Execute(Schema);
    }
}
