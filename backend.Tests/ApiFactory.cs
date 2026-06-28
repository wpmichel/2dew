using System.Net.Http.Headers;
using System.Net.Http.Json;
using Backend.Dtos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Backend.Tests;

// Boots the real API against a throwaway SQLite file so tests exercise the full pipeline
// (auth, controllers, SQL) end to end, then deletes the file on dispose.
public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"todo-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
        builder.UseSetting("Jwt:Key", "integration-test-signing-key-integration-test-signing-key");
    }

    // Registers a fresh user and returns a client that authenticates as them.
    public async Task<HttpClient> CreateUserClientAsync(string email)
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123" });
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && File.Exists(_dbPath))
            File.Delete(_dbPath);
    }
}
