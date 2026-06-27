using System.ComponentModel.DataAnnotations;
using Backend.Data;
using Backend.Models;

namespace Backend.Dtos;

public class CreateTaskRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "Title is required.")]
    [MaxLength(DatabaseInitializer.MaxTitleLength)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }
    public DateTime? DueDateUtc { get; set; }
}

public class UpdateTaskRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "Title is required.")]
    [MaxLength(DatabaseInitializer.MaxTitleLength)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }
    public DateTime? DueDateUtc { get; set; }
    public bool IsCompleted { get; set; }
}

public record TaskResponse(
    Guid Id,
    string Title,
    string? Description,
    DateTime? DueDateUtc,
    bool IsCompleted,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    // Values are stored UTC but read back from SQLite as Kind=Unspecified; tag them so they
    // serialize with a trailing 'Z' and the frontend renders the correct local time.
    public static TaskResponse From(TaskItem t) =>
        new(t.Id, t.Title, t.Description, AsUtc(t.DueDateUtc), t.IsCompleted, AsUtc(t.CreatedAt), AsUtc(t.UpdatedAt));

    private static DateTime AsUtc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
    private static DateTime? AsUtc(DateTime? value) =>
        value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null;
}

public record PagedResponse<T>(IReadOnlyList<T> Items, string? NextCursor);
