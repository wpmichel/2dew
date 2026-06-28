using System.Net;
using System.Net.Http.Json;
using System.Text;

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
}
