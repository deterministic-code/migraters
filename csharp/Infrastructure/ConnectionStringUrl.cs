namespace Deterministic.MigrateRunner;

internal static class ConnectionStringUrl
{
    public static bool LooksLikeUrl(string connection, params string[] schemes) =>
        schemes.Any(s => connection.StartsWith($"{s}://", StringComparison.OrdinalIgnoreCase));

    public static (string? user, string? pass) SplitUserInfo(string userInfo) =>
        string.IsNullOrEmpty(userInfo)
            ? (null, null)
            : userInfo.Split(':', 2) is [var u, var p]
                ? (Uri.UnescapeDataString(u), Uri.UnescapeDataString(p))
            : (Uri.UnescapeDataString(userInfo), null);

    public static string TrimLeadingSlash(string path) => path.StartsWith('/') ? path[1..] : path;

    public static IEnumerable<KeyValuePair<string, string>> ParseQuery(string query) =>
        string.IsNullOrEmpty(query)
            ? []
            : (query.StartsWith('?') ? query[1..] : query)
                .Split('&', StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Split('=', 2))
                .Where(p => p[0].Length > 0)
                .Select(p => new KeyValuePair<string, string>(
                    Uri.UnescapeDataString(p[0]),
                    Uri.UnescapeDataString(p.Length > 1 ? p[1] : "")
                ));

    public static string? TryUri(string connection, params string[] schemes) =>
        LooksLikeUrl(connection, schemes) ? connection : null;

    public static void ApplyUriParts(
        Uri uri,
        Action<string?, string?> setAuth,
        Action<string> setDatabase,
        Action<string, string> setQuery
    )
    {
        var (user, pass) = SplitUserInfo(uri.UserInfo);
        setAuth(user, pass);
        var db = TrimLeadingSlash(uri.AbsolutePath);
        if (!string.IsNullOrEmpty(db))
            setDatabase(db);
        foreach (var kv in ParseQuery(uri.Query))
            setQuery(kv.Key, kv.Value);
    }
}
