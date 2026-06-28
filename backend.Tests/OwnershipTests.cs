using System.Net;
using System.Net.Http.Json;
using Backend.Dtos;

namespace Backend.Tests;

// The highest-risk area: a user must never reach another user's task, even with its exact id.
public class OwnershipTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public OwnershipTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task User_cannot_read_update_or_delete_another_users_task()
    {
        var alice = await _factory.CreateUserClientAsync("owner-alice@example.com");
        var bob = await _factory.CreateUserClientAsync("owner-bob@example.com");

        var created = await alice.PostAsJsonAsync("/api/tasks", new { title = "Alice's secret" });
        var task = await created.Content.ReadFromJsonAsync<TaskResponse>();
        var id = task!.Id;

        var get = await bob.GetAsync($"/api/tasks/{id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);

        var put = await bob.PutAsJsonAsync($"/api/tasks/{id}",
            new { title = "hijacked", isCompleted = true });
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);

        var delete = await bob.DeleteAsync($"/api/tasks/{id}");
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);

        var stillThere = await alice.GetFromJsonAsync<TaskResponse>($"/api/tasks/{id}");
        Assert.Equal("Alice's secret", stillThere!.Title);
        Assert.False(stillThere.IsCompleted);
    }

    [Fact]
    public async Task User_list_never_includes_another_users_tasks()
    {
        var alice = await _factory.CreateUserClientAsync("list-alice@example.com");
        var bob = await _factory.CreateUserClientAsync("list-bob@example.com");

        await alice.PostAsJsonAsync("/api/tasks", new { title = "Alice task 1" });
        await alice.PostAsJsonAsync("/api/tasks", new { title = "Alice task 2" });

        var bobPage = await bob.GetFromJsonAsync<PagedResponse<TaskResponse>>("/api/tasks");
        Assert.Empty(bobPage!.Items);
    }
}
