namespace Deterministic.MigrateRunner;

internal static class FnvChecksum
{
    // FNV-1a 64-bit hex — HashDepot, same offset/prime as rust checksum_hex so checksums round-trip across runners.
    public static string Hex(string sql) =>
        Fnv1a.Hash64(Encoding.UTF8.GetBytes(sql)).ToString("x16", CultureInfo.InvariantCulture);
}
