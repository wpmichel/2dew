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

    private readonly ConnectionFactory _db;

    public TasksController(ConnectionFactory db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<PagedResponse<TaskResponse>>> List(
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        [FromQuery] string? search)
    {
        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        var where = new List<string> { "UserId = @userId" };
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
            args.Add("cursorCreatedAt", c.CreatedAt);
            args.Add("cursorId", c.Id);
        }

        // Fetch one extra row to know whether a further page exists.
        args.Add("take", pageSize + 1);
        var sql = $@"
            SELECT Id, UserId, Title, Description, DueDateUtc, IsCompleted, CreatedAt, UpdatedAt
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
            IsCompleted = false,
            CreatedAt = now,
            UpdatedAt = now,
        };

        using var conn = _db.Create();
        await conn.ExecuteAsync(
            @"INSERT INTO Tasks (Id, UserId, Title, Description, DueDateUtc, IsCompleted, CreatedAt, UpdatedAt)
              VALUES (@Id, @UserId, @Title, @Description, @DueDateUtc, @IsCompleted, @CreatedAt, @UpdatedAt)",
            task);

        return CreatedAtAction(nameof(Get), new { id = task.Id }, TaskResponse.From(task));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TaskResponse>> Update(Guid id, UpdateTaskRequest request)
    {
        var task = await FindOwned(id);
        if (task is null) return NotFound();

        task.Title = request.Title.Trim();
        task.Description = request.Description;
        task.DueDateUtc = request.DueDateUtc?.ToUniversalTime();
        task.IsCompleted = request.IsCompleted;
        task.UpdatedAt = DateTime.UtcNow;

        using var conn = _db.Create();
        await conn.ExecuteAsync(
            @"UPDATE Tasks
              SET Title = @Title, Description = @Description, DueDateUtc = @DueDateUtc,
                  IsCompleted = @IsCompleted, UpdatedAt = @UpdatedAt
              WHERE Id = @Id AND UserId = @UserId",
            task);

        return Ok(TaskResponse.From(task));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        using var conn = _db.Create();
        var affected = await conn.ExecuteAsync(
            "DELETE FROM Tasks WHERE Id = @id AND UserId = @userId",
            new { id, userId = UserId });

        return affected == 0 ? NotFound() : NoContent();
    }

    private Guid UserId => User.GetUserId();

    // Every single-item lookup is scoped to the caller, so a non-owner gets the same null as a
    // missing row and the controller returns 404 without leaking another user's data.
    private async Task<TaskItem?> FindOwned(Guid id)
    {
        using var conn = _db.Create();
        return await conn.QuerySingleOrDefaultAsync<TaskItem>(
            @"SELECT Id, UserId, Title, Description, DueDateUtc, IsCompleted, CreatedAt, UpdatedAt
              FROM Tasks WHERE Id = @id AND UserId = @userId",
            new { id, userId = UserId });
    }
}
