namespace Backend.Auth;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "todo-app";
    public string Audience { get; set; } = "todo-app";
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 1440;
}
