using Backend.Auth;
using Backend.Data;
using Backend.Dtos;
using Backend.Models;
using Dapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly ConnectionFactory _db;
    private readonly JwtTokenService _tokens;
    private readonly IPasswordHasher<User> _hasher;

    public AuthController(ConnectionFactory db, JwtTokenService tokens, IPasswordHasher<User> hasher)
    {
        _db = db;
        _tokens = tokens;
        _hasher = hasher;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        using var conn = _db.Create();

        var exists = await conn.ExecuteScalarAsync<long>(
            "SELECT COUNT(1) FROM Users WHERE Email = @email", new { email });
        if (exists > 0)
        {
            ModelState.AddModelError(nameof(request.Email), "An account with this email already exists.");
            return ValidationProblem(ModelState);
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            CreatedAt = DateTime.UtcNow,
        };
        user.PasswordHash = _hasher.HashPassword(user, request.Password);

        await conn.ExecuteAsync(
            @"INSERT INTO Users (Id, Email, PasswordHash, CreatedAt)
              VALUES (@Id, @Email, @PasswordHash, @CreatedAt)",
            user);

        return Ok(new AuthResponse(_tokens.CreateToken(user), user.Email));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        using var conn = _db.Create();

        var user = await conn.QuerySingleOrDefaultAsync<User>(
            "SELECT * FROM Users WHERE Email = @email", new { email });

        if (user is null ||
            _hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
                == PasswordVerificationResult.Failed)
        {
            return Unauthorized(new ProblemDetails { Title = "Invalid email or password." });
        }

        return Ok(new AuthResponse(_tokens.CreateToken(user), user.Email));
    }
}
