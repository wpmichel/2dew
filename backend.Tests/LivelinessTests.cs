using System.Net;
using System.Net.Http.Json;
using Backend.Dtos;

namespace Backend.Tests;

// Liveliness: completing or deleting a task moves it to the completed section rather than
// destroying it, it can be reopened back into the active list, and the due-soon rollup and
// completed section stay owner-scoped.
public class LivelinessTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public LivelinessTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Completing_a_task_moves_it_from_the_active_list_to_completed()
    {
        var client = await _factory.CreateUserClientAsync("live-complete@example.com");
        var task = await Create(client, "Finish the report");

        await Complete(client, task);

        var active = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks");
        Assert.DoesNotContain(active!.Items, t => t.Id == task.Id);

        var completed = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks/completed");
        var found = completed!.Items.Single(t => t.Id == task.Id);
        Assert.True(found.IsCompleted);
        Assert.NotNull(found.CompletedAt);
    }

    [Fact]
    public async Task Deleting_a_task_soft_deletes_it_into_the_completed_section()
    {
        var client = await _factory.CreateUserClientAsync("live-delete@example.com");
        var task = await Create(client, "Cancel the order");

        var delete = await client.DeleteAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var active = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks");
        Assert.DoesNotContain(active!.Items, t => t.Id == task.Id);

        var completed = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks/completed");
        Assert.Contains(completed!.Items, t => t.Id == task.Id);
    }

    [Fact]
    public async Task Reopening_a_completed_task_returns_it_to_the_active_list()
    {
        var client = await _factory.CreateUserClientAsync("live-reopen@example.com");
        var task = await Create(client, "Water the plants");
        await Complete(client, task);

        await Reopen(client, task);

        var active = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks");
        Assert.Contains(active!.Items, t => t.Id == task.Id);

        var completed = await client.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks/completed");
        Assert.DoesNotContain(completed!.Items, t => t.Id == task.Id);
    }

    [Fact]
    public async Task Due_soon_includes_tasks_within_the_window_and_overdue_but_excludes_the_rest()
    {
        var client = await _factory.CreateUserClientAsync("live-duesoon@example.com");
        var soon = await Create(client, "Due tomorrow", dueInDays: 1);
        var overdue = await Create(client, "Overdue", dueInDays: -1);
        var later = await Create(client, "Due next week", dueInDays: 7);
        var noDate = await Create(client, "No due date");

        var dueSoon = await client.GetFromJsonAsync<List<TaskResponse>>("/api/tasks/due-soon");

        var ids = dueSoon!.Select(t => t.Id).ToHashSet();
        Assert.Contains(soon.Id, ids);
        Assert.Contains(overdue.Id, ids);
        Assert.DoesNotContain(later.Id, ids);
        Assert.DoesNotContain(noDate.Id, ids);
    }

    [Fact]
    public async Task Completed_section_never_includes_another_users_tasks()
    {
        var alice = await _factory.CreateUserClientAsync("done-alice@example.com");
        var bob = await _factory.CreateUserClientAsync("done-bob@example.com");

        var task = await Create(alice, "Alice done");
        await Complete(alice, task);

        var bobCompleted = await bob.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks/completed");
        Assert.Empty(bobCompleted!.Items);
    }

    [Fact]
    public async Task Due_soon_never_includes_another_users_tasks()
    {
        var alice = await _factory.CreateUserClientAsync("duesoon-alice@example.com");
        var bob = await _factory.CreateUserClientAsync("duesoon-bob@example.com");

        await Create(alice, "Alice due tomorrow", dueInDays: 1);

        var bobDueSoon = await bob.GetFromJsonAsync<List<TaskResponse>>("/api/tasks/due-soon");
        Assert.Empty(bobDueSoon!);
    }

    private static async Task<TaskResponse> Create(HttpClient client, string title, int? dueInDays = null)
    {
        object body = dueInDays is null
            ? new { title }
            : new { title, dueDateUtc = DateTime.UtcNow.AddDays(dueInDays.Value) };
        var res = await client.PostAsJsonAsync("/api/tasks", body);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<TaskResponse>())!;
    }

    private static async Task Complete(HttpClient client, TaskResponse task) =>
        (await client.PutAsJsonAsync($"/api/tasks/{task.Id}",
            new { title = task.Title, isCompleted = true })).EnsureSuccessStatusCode();

    private static async Task Reopen(HttpClient client, TaskResponse task) =>
        (await client.PutAsJsonAsync($"/api/tasks/{task.Id}",
            new { title = task.Title, isCompleted = false })).EnsureSuccessStatusCode();
}
