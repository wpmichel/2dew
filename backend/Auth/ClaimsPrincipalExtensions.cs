using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Backend.Auth;

public static class ClaimsPrincipalExtensions
{
    // JwtBearer is configured with MapInboundClaims = false, so the subject stays as "sub".
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

        if (value is null || !Guid.TryParse(value, out var id))
            throw new InvalidOperationException("Authenticated request is missing a valid user id claim.");

        return id;
    }
}
