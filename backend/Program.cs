using System.Text;
using Backend.Auth;
using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var connectionString = builder.Configuration.GetConnectionString("Default") ?? "Data Source=app.db";
builder.Services.AddSingleton(new ConnectionFactory(connectionString));

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
// Fail fast rather than start up signing/accepting tokens with an unusable key. HMAC-SHA256
// needs at least a 256-bit (32-byte) key; an empty or short Jwt:Key is a misconfiguration.
if (string.IsNullOrWhiteSpace(jwt.Key) || Encoding.UTF8.GetByteCount(jwt.Key) < 32)
    throw new InvalidOperationException(
        "Jwt:Key is missing or too short (need at least 32 bytes for HMAC-SHA256). Set it in configuration.");
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        };
    });
builder.Services.AddAuthorization();

const string CorsPolicy = "frontend";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(options =>
    options.AddPolicy(CorsPolicy, policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

SqliteTypeHandlers.Register();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Create the schema on startup so a fresh clone runs with no manual DB steps.
DatabaseInitializer.Initialize(app.Services.GetRequiredService<ConnectionFactory>());

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

public partial class Program { }
