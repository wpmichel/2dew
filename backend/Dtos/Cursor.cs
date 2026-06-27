using System.Text;

namespace Backend.Dtos;

// Opaque keyset cursor encoding the last seen (CreatedAt, Id) so the next page can
// resume without offset drift when rows are inserted or deleted mid-scroll.
public record Cursor(DateTime CreatedAt, Guid Id)
{
    public string Encode()
    {
        var raw = $"{CreatedAt.Ticks}:{Id}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
    }

    public static bool TryDecode(string? value, out Cursor cursor)
    {
        cursor = new Cursor(default, default);
        if (string.IsNullOrEmpty(value)) return false;

        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(value));
            var parts = raw.Split(':', 2);
            if (parts.Length != 2) return false;
            if (!long.TryParse(parts[0], out var ticks)) return false;
            if (!Guid.TryParse(parts[1], out var id)) return false;

            cursor = new Cursor(new DateTime(ticks, DateTimeKind.Utc), id);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
