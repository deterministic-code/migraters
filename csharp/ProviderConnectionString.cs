// URL→keyword translator for Npgsql / MySqlConnector / Microsoft.Data.Sqlite. Mirrors the implicit URL parsing that node's `pg` + `mysql2` and rust's `sqlx` do natively, so consumers can pass `postgresql://`/`mysql://`/`sqlite://` (or a bare path) at any --connection site.

using MySqlConnector;
using Npgsql;

namespace Deterministic.MigrateRunner;

internal static class ProviderConnectionString
{
    public static string Sqlite(string? connection)
    {
        var c = connection ?? string.Empty;
        if (c.Contains('=', StringComparison.Ordinal))
        {
            return c;
        }
        if (c.StartsWith("sqlite://", StringComparison.OrdinalIgnoreCase))
        {
            var path = c.Substring("sqlite://".Length);
            return string.IsNullOrEmpty(path) ? "Data Source=:memory:" : $"Data Source={path}";
        }
        return string.IsNullOrEmpty(c) ? "Data Source=:memory:" : $"Data Source={c}";
    }

    // Returns the filesystem path for a sqlite connection string, or null for :memory: (which is always ephemeral and should skip the existence check).
    public static string? SqliteFilesystemPath(string? connection)
    {
        var s = (connection ?? string.Empty).Trim();
        var eq = s.IndexOf('=', StringComparison.Ordinal);
        if (eq >= 0)
        {
            var key = s.Substring(0, eq).Trim().Replace(" ", string.Empty);
            if (string.Equals(key, "DataSource", StringComparison.OrdinalIgnoreCase))
            {
                s = s.Substring(eq + 1).Trim();
                var semi = s.IndexOf(';', StringComparison.Ordinal);
                if (semi >= 0) { s = s.Substring(0, semi).Trim(); }
            }
        }
        if (s.StartsWith("sqlite://", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring("sqlite://".Length);
        }
        else if (s.StartsWith("sqlite:", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring("sqlite:".Length);
        }
        else if (s.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring("file:".Length);
        }
        if (s.Length == 0 || string.Equals(s, ":memory:", StringComparison.Ordinal))
        {
            return null;
        }
        return s;
    }

    public static string Postgres(string connection)
    {
        if (!LooksLikeUrl(connection, "postgres", "postgresql"))
        {
            return connection;
        }
        var uri = new Uri(connection);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
        };
        var (user, pass) = SplitUserInfo(uri.UserInfo);
        if (user is not null) { builder.Username = user; }
        if (pass is not null) { builder.Password = pass; }
        var db = TrimLeadingSlash(uri.AbsolutePath);
        if (!string.IsNullOrEmpty(db)) { builder.Database = db; }
        foreach (var kv in ParseQuery(uri.Query))
        {
            builder[kv.Key] = kv.Value;
        }
        return builder.ToString();
    }

    public static string Mysql(string connection)
    {
        if (!LooksLikeUrl(connection, "mysql"))
        {
            return connection;
        }
        var uri = new Uri(connection);
        var builder = new MySqlConnectionStringBuilder
        {
            Server = uri.Host,
            Port = (uint)(uri.Port > 0 ? uri.Port : 3306),
        };
        var (user, pass) = SplitUserInfo(uri.UserInfo);
        if (user is not null) { builder.UserID = user; }
        if (pass is not null) { builder.Password = pass; }
        var db = TrimLeadingSlash(uri.AbsolutePath);
        if (!string.IsNullOrEmpty(db)) { builder.Database = db; }
        foreach (var kv in ParseQuery(uri.Query))
        {
            builder[kv.Key] = kv.Value;
        }
        return builder.ToString();
    }

    private static bool LooksLikeUrl(string connection, params string[] schemes)
    {
        foreach (var s in schemes)
        {
            if (connection.StartsWith($"{s}://", StringComparison.OrdinalIgnoreCase)) { return true; }
        }
        return false;
    }

    private static (string? user, string? pass) SplitUserInfo(string userInfo)
    {
        if (string.IsNullOrEmpty(userInfo)) { return (null, null); }
        var idx = userInfo.IndexOf(':', StringComparison.Ordinal);
        if (idx < 0) { return (Uri.UnescapeDataString(userInfo), null); }
        return (Uri.UnescapeDataString(userInfo.Substring(0, idx)), Uri.UnescapeDataString(userInfo.Substring(idx + 1)));
    }

    private static string TrimLeadingSlash(string path)
    {
        return string.IsNullOrEmpty(path) || path[0] != '/' ? path : path.Substring(1);
    }

    private static IEnumerable<KeyValuePair<string, string>> ParseQuery(string query)
    {
        if (string.IsNullOrEmpty(query)) { yield break; }
        var q = query[0] == '?' ? query.Substring(1) : query;
        foreach (var part in q.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=', StringComparison.Ordinal);
            var key = eq < 0 ? part : part.Substring(0, eq);
            var value = eq < 0 ? string.Empty : part.Substring(eq + 1);
            if (key.Length == 0) { continue; }
            yield return new KeyValuePair<string, string>(Uri.UnescapeDataString(key), Uri.UnescapeDataString(value));
        }
    }
}
