namespace Backend.Models;

public class TaskItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime? DueDateUtc { get; set; }

    // A task's lifecycle is a single timestamp: null means active, non-null means completed
    // (whether finished via the checkbox or removed via the trash icon). Replaces a separate
    // IsCompleted flag and doubles as the value the completed-section TTL is measured against.
    public DateTime? CompletedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public bool IsCompleted => CompletedAt.HasValue;
}
