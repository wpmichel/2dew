namespace Backend.Models;

public class TaskItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime? DueDateUtc { get; set; }

    // A task's lifecycle is a single timestamp: null means active, non-null means completed.
    public DateTime? CompletedAt { get; set; }

    // Soft delete: null means live, non-null is the time task was marked for deletion. 
    public DateTime? DeletedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public bool IsCompleted => CompletedAt.HasValue;
}
