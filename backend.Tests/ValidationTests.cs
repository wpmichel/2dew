using System.Net;
using System.Net.Http.Json;
using System.Text;
using Backend.Dtos;

namespace Backend.Tests;

// The second highest-risk area: bad input must be rejected, and protected routes must require auth.
public class ValidationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ValidationTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Empty_title_is_rejected_with_400()
    {
        var client = await _factory.CreateUserClientAsync("val-empty@example.com");

        var response = await client.PostAsJsonAsync("/api/tasks", new { title = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_due_date_is_rejected_with_400()
    {
        var client = await _factory.CreateUserClientAsync("val-date@example.com");

        var body = new StringContent(
            """{ "title": "Valid title", "dueDateUtc": "not-a-real-date" }""",
            Encoding.UTF8, "application/json");
        var response = await client.PostAsync("/api/tasks", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_request_is_rejected_with_401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/tasks");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Title_over_the_max_length_is_rejected_with_400()
    {
        var client = await _factory.CreateUserClientAsync("val-long@example.com");

        var response = await client.PostAsJsonAsync("/api/tasks", new { title = new string('x', 201) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Registering_a_duplicate_email_is_rejected_with_400()
    {
        const string email = "val-dupe@example.com";
        await _factory.CreateUserClientAsync(email); // first registration succeeds

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_a_task_with_invalid_input_is_rejected_with_400()
    {
        var client = await _factory.CreateUserClientAsync("val-update@example.com");
        var created = await client.PostAsJsonAsync("/api/tasks", new { title = "Original" });
        var task = await created.Content.ReadFromJsonAsync<TaskResponse>();
        var id = task!.Id;

        var whitespace = await client.PutAsJsonAsync($"/api/tasks/{id}",
            new { title = "   ", isCompleted = false });
        Assert.Equal(HttpStatusCode.BadRequest, whitespace.StatusCode);

        var tooLong = await client.PutAsJsonAsync($"/api/tasks/{id}",
            new { title = new string('x', 201), isCompleted = false });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        var badDate = new StringContent(
            """{ "title": "Valid title", "dueDateUtc": "not-a-real-date" }""",
            Encoding.UTF8, "application/json");
        var invalidDate = await client.PutAsync($"/api/tasks/{id}", badDate);
        Assert.Equal(HttpStatusCode.BadRequest, invalidDate.StatusCode);
    }
}
