using Dapper;

namespace Backend.Data;

// Idempotent schema bootstrap run at startup
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
    -- null = active; non-null = completed. 
    CompletedAt TEXT NULL,
    -- null = live; non-null = soft-deleted. 
    DeletedAt   TEXT NULL,
    CreatedAt   TEXT NOT NULL,
    UpdatedAt   TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
);
-- Backs keyset pagination of the active list, ordered by (CreatedAt, Id) within a user.
CREATE INDEX IF NOT EXISTS IX_Tasks_UserId_CreatedAt_Id ON Tasks(UserId, CreatedAt, Id);
-- Backs the completed section's keyset pagination and the active/due-soon CompletedAt filter.
CREATE INDEX IF NOT EXISTS IX_Tasks_UserId_CompletedAt ON Tasks(UserId, CompletedAt, Id);
-- Backs soft-delete filter 
CREATE INDEX IF NOT EXISTS IX_Tasks_UserId_DeletedAt ON Tasks(UserId, DeletedAt, Id);
";

    public static void Initialize(ConnectionFactory factory)
    {
        using var connection = factory.Create();
        connection.Execute(Schema);
    }
}
