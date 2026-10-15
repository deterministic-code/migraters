using System.Security.Cryptography;

namespace Deterministic.MigrateRunner;

internal static class Checksum
{
    private static readonly Regex LegacyHeader = new(
        @"^(?://|--|#)\s+deterministic-content-hash:\s+[0-9a-f]{64}\s*\r?\n?",
        RegexOptions.Compiled
    );

    public static string Hex(string sql)
    {
        var body = LegacyHeader.Replace(sql, "", 1);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(body));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
