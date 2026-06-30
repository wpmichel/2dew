using Backend.Auth;
using Backend.Data;
using Backend.Dtos;
using Backend.Models;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/tasks")]
public class TasksController : ControllerBase
{
    private const int DefaultLimit = 20;
    private const int MaxLimit = 100;

    // Completed tasks fall out of the completed section once they are this old. 
    private const int CompletedTtlDays = 30;

    // The due-soon rollup surfaces tasks due or overdue within this window.
    private const int DueSoonDays = 2;
    private const int DueSoonLimit = 50;

    private readonly ConnectionFactory _db;

    public TasksController(ConnectionFactory db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<PagedResponse<TaskResponse>>> List(
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        [FromQuery] string? search)
    {
        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        var where = new List<string> { "UserId = @userId", "CompletedAt IS NULL", "DeletedAt IS NULL" };
        var args = new DynamicParameters();
        args.Add("userId", UserId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            where.Add("(instr(lower(Title), @term) > 0 OR (Description IS NOT NULL AND instr(lower(Description), @term) > 0))");
            args.Add("term", term);
        }

        if (!string.IsNullOrEmpty(cursor))
        {
            if (!Cursor.TryDecode(cursor, out var c))
                return BadRequest(new ProblemDetails { Title = "Invalid cursor." });

            // Keyset predicate over the same (CreatedAt, Id) order the index is built on,
            // so inserts/deletes mid-scroll never skip or duplicate a row.
            where.Add("(CreatedAt < @cursorCreatedAt OR (CreatedAt = @cursorCreatedAt AND Id < @cursorId))");
            args.Add("cursorCreatedAt", c.Timestamp);
            args.Add("cursorId", c.Id);
        }

        // Fetch one extra row to know whether a further page exists.
        args.Add("take", pageSize + 1);
        var sql = $@"
            SELECT Id, UserId, Title, Description, DueDateUtc, CompletedAt, CreatedAt, UpdatedAt
            FROM Tasks
            WHERE {string.Join(" AND ", where)}
            ORDER BY CreatedAt DESC, Id DESC
            LIMIT @take";

        using var conn = _db.Create();
        var rows = (await conn.QueryAsync<TaskItem>(sql, args)).ToList();

        string? nextCursor = null;
        if (rows.Count > pageSize)
        {
            var last = rows[pageSize - 1];
            nextCursor = new Cursor(last.CreatedAt, last.Id).Encode();
            rows.RemoveAt(rows.Count - 1);
        }

        var items = rows.Select(TaskResponse.From).ToList();
        return Ok(new PagedResponse<TaskResponse>(items, nextCursor));
    }

    // The completed section: most-recently-completed first, capped to a rolling TTL.
    [HttpGet("completed")]
    public async Task<ActionResult<PagedResponse<TaskResponse>>> ListCompleted(
        [FromQuery] string? cursor,
        [FromQuery] int? limit)
    {
        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        var where = new List<string>
        {
            "UserId = @userId",
            "CompletedAt IS NOT NULL",
            "CompletedAt > @ttl",
            // A soft-deleted task is gone, not completed - keep it out of the completed section.
            "DeletedAt IS NULL",
        };
        var args = new DynamicParameters();
        args.Add("userId", UserId);
        args.Add("ttl", DateTime.UtcNow.AddDays(-CompletedTtlDays));

        if (!string.IsNullOrEmpty(cursor))
        {
            if (!Cursor.TryDecode(cursor, out var c))
                return BadRequest(new ProblemDetails { Title = "Invalid cursor." });

            // Same keyset shape as the active list, ordered by CompletedAt instead.
            where.Add("(CompletedAt < @cursorTs OR (CompletedAt = @cursorTs AND Id < @cursorId))");
            args.Add("cursorTs", c.Timestamp);
            args.Add("cursorId", c.Id);
        }

        args.Add("take", pageSize + 1);
        var sql = $@"
            SELECT Id, UserId, Title, Description, DueDateUtc, CompletedAt, CreatedAt, UpdatedAt
            FROM Tasks
            WHERE {string.Join(" AND ", where)}
            ORDER BY CompletedAt DESC, Id DESC
            LIMIT @take";

        using var conn = _db.Create();
        var rows = (await conn.QueryAsync<TaskItem>(sql, args)).ToList();

        string? nextCursor = null;
        if (rows.Count > pageSize)
        {
            var last = rows[pageSize - 1];
            nextCursor = new Cursor(last.CompletedAt!.Value, last.Id).Encode();
            rows.RemoveAt(rows.Count - 1);
        }

        var items = rows.Select(TaskResponse.From).ToList();
        return Ok(new PagedResponse<TaskResponse>(items, nextCursor));
    }

    // Active tasks due within the next DueSoonDays (and anything already overdue), soonest first.
    // Small and unpaginated - it backs a collapsible "due soon" rollup, not a scrollable list.
    [HttpGet("due-soon")]
    public async Task<ActionResult<IReadOnlyList<TaskResponse>>> ListDueSoon()
    {
        var args = new DynamicParameters();
        args.Add("userId", UserId);
        args.Add("threshold", DateTime.UtcNow.AddDays(DueSoonDays));
        args.Add("take", DueSoonLimit);

        const string sql = @"
            SELECT Id, UserId, Title, Description, DueDateUtc, CompletedAt, CreatedAt, UpdatedAt
            FROM Tasks
            WHERE UserId = @userId
              AND CompletedAt IS NULL
              AND DeletedAt IS NULL
              AND DueDateUtc IS NOT NULL
              AND DueDateUtc <= @threshold
            ORDER BY DueDateUtc ASC, Id ASC
            LIMIT @take";

        using var conn = _db.Create();
        var rows = await conn.QueryAsync<TaskItem>(sql, args);
        return Ok(rows.Select(TaskResponse.From).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TaskResponse>> Get(Guid id)
    {
        var task = await FindOwned(id);
        return task is null ? NotFound() : Ok(TaskResponse.From(task));
    }

    [HttpPost]
    public async Task<ActionResult<TaskResponse>> Create(CreateTaskRequest request)
    {
        var now = DateTime.UtcNow;
        var task = new TaskItem
        {
            Id = Guid.NewGuid(),
            UserId = UserId,
            Title = request.Title.Trim(),
            Description = request.Description,
            DueDateUtc = request.DueDateUtc?.ToUniversalTime(),
            CompletedAt = null,
            CreatedAt = now,
            UpdatedAt = now,
        };

        using var conn = _db.Create();
        await conn.ExecuteAsync(
            @"INSERT INTO Tasks (Id, UserId, Title, Description, DueDateUtc, CompletedAt, CreatedAt, UpdatedAt)
              VALUES (@Id, @UserId, @Title, @Description, @DueDateUtc, @CompletedAt, @CreatedAt, @UpdatedAt)",
            task);

        return CreatedAtAction(nameof(Get), new { id = task.Id }, TaskResponse.From(task));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TaskResponse>> Update(Guid id, UpdateTaskRequest request)
    {
        var task = await FindOwned(id);
        if (task is null) return NotFound();

        var now = DateTime.UtcNow;
        task.Title = request.Title.Trim();
        task.Description = request.Description;
        task.DueDateUtc = request.DueDateUtc?.ToUniversalTime();
        // Map the request's boolean onto the timestamp: keep the original completion time when
        // it was already complete, stamp now when newly completed, clear it when reopened.
        task.CompletedAt = request.IsCompleted ? task.CompletedAt ?? now : null;
        task.UpdatedAt = now;

        using var conn = _db.Create();
        await conn.ExecuteAsync(
            @"UPDATE Tasks
              SET Title = @Title, Description = @Description, DueDateUtc = @DueDateUtc,
                  CompletedAt = @CompletedAt, UpdatedAt = @UpdatedAt
              WHERE Id = @Id AND UserId = @UserId",
            task);

        return Ok(TaskResponse.From(task));
    }

    // Delete is a soft delete: it stamps DeletedAt rather than removing the row, so the record is
    // retained for a future cleanup job while being filtered out of every read query (so it never
    // resurfaces - not even in the completed section).
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var now = DateTime.UtcNow;
        using var conn = _db.Create();
        var affected = await conn.ExecuteAsync(
            "UPDATE Tasks SET DeletedAt = @now, UpdatedAt = @now " +
            "WHERE Id = @id AND UserId = @userId AND DeletedAt IS NULL",
            new { now, id, userId = UserId });

        return affected == 0 ? NotFound() : NoContent();
    }

    private Guid UserId => User.GetUserId();

    // Every single-item lookup is scoped to the caller, so a non-owner gets the same null as a
    // missing row and the controller returns 404 without leaking another user's data.
    private async Task<TaskItem?> FindOwned(Guid id)
    {
        using var conn = _db.Create();
        return await conn.QuerySingleOrDefaultAsync<TaskItem>(
            @"SELECT Id, UserId, Title, Description, DueDateUtc, CompletedAt, CreatedAt, UpdatedAt
              FROM Tasks WHERE Id = @id AND UserId = @userId AND DeletedAt IS NULL",
            new { id, userId = UserId });
    }
}
