using System.Net.Http.Json;
using Backend.Dtos;

namespace Backend.Tests;

// Keyset pagination must hand off cleanly between pages: every task appears exactly once across
// pages, and a search term carries through the cursor without dropping or duplicating rows.
public class PaginationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public PaginationTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Paging_covers_every_task_exactly_once()
    {
        var client = await _factory.CreateUserClientAsync("page-all@example.com");
        for (var i = 0; i < 3; i++)
            await client.PostAsJsonAsync("/api/tasks", new { title = $"Task {i}" });

        var first = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks?limit=2");
        Assert.Equal(2, first!.Items.Count);
        Assert.NotNull(first.NextCursor);

        var second = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>(
            $"/api/tasks?limit=2&cursor={Uri.EscapeDataString(first.NextCursor!)}");
        Assert.Single(second!.Items);
        Assert.Null(second.NextCursor);

        var ids = first.Items.Concat(second.Items).Select(t => t.Id).ToList();
        Assert.Equal(3, ids.Distinct().Count());
    }

    [Fact]
    public async Task Paging_with_a_search_term_stays_consistent_across_pages()
    {
        var client = await _factory.CreateUserClientAsync("page-search@example.com");
        for (var i = 0; i < 3; i++)
            await client.PostAsJsonAsync("/api/tasks", new { title = $"groceries {i}" });
        await client.PostAsJsonAsync("/api/tasks", new { title = "unrelated" });

        var first = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>(
            "/api/tasks?limit=2&search=groceries");
        Assert.Equal(2, first!.Items.Count);
        Assert.NotNull(first.NextCursor);

        var second = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>(
            $"/api/tasks?limit=2&search=groceries&cursor={Uri.EscapeDataString(first.NextCursor!)}");
        Assert.Single(second!.Items);
        Assert.Null(second.NextCursor);

        var all = first.Items.Concat(second.Items).ToList();
        Assert.Equal(3, all.Select(t => t.Id).Distinct().Count());
        Assert.All(all, t => Assert.Contains("groceries", t.Title));
    }
}
