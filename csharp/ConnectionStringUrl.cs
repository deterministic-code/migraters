namespace Deterministic.MigrateRunner;

internal static class ConnectionStringUrl
{
    public static bool LooksLikeUrl(string connection, params string[] schemes)
    {
        foreach (var s in schemes)
        {
            if (connection.StartsWith($"{s}://", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    public static (string? user, string? pass) SplitUserInfo(string userInfo)
    {
        if (string.IsNullOrEmpty(userInfo))
        {
            return (null, null);
        }
        var idx = userInfo.IndexOf(':', StringComparison.Ordinal);
        if (idx < 0)
        {
            return (Uri.UnescapeDataString(userInfo), null);
        }
        return (
            Uri.UnescapeDataString(userInfo.Substring(0, idx)),
            Uri.UnescapeDataString(userInfo.Substring(idx + 1)));
    }

    public static string TrimLeadingSlash(string path) =>
        string.IsNullOrEmpty(path) || path[0] != '/' ? path : path.Substring(1);

    public static IEnumerable<KeyValuePair<string, string>> ParseQuery(string query)
    {
        if (string.IsNullOrEmpty(query))
        {
            yield break;
        }
        var q = query[0] == '?' ? query.Substring(1) : query;
        foreach (var part in q.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=', StringComparison.Ordinal);
            var key = eq < 0 ? part : part.Substring(0, eq);
            var value = eq < 0 ? string.Empty : part.Substring(eq + 1);
            if (key.Length == 0)
            {
                continue;
            }
            yield return new KeyValuePair<string, string>(
                Uri.UnescapeDataString(key),
                Uri.UnescapeDataString(value));
        }
    }
}
