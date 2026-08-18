using System.Globalization;
using System.Text;

namespace Deterministic.MigrateRunner;

internal static class FnvChecksum
{
    // FNV-1a 64-bit hex — matches checksum_hex in scripts/templates/create-backend-app/rust/migrate_up.rs so checksums round-trip across runners.
    public static string Hex(string sql)
    {
        ulong hash = 0xcbf29ce484222325UL;
        foreach (var b in Encoding.UTF8.GetBytes(sql))
        {
            hash ^= b;
            hash = unchecked(hash * 0x100000001b3UL);
        }
        return hash.ToString("x16", CultureInfo.InvariantCulture);
    }
}
