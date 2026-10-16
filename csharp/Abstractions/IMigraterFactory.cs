namespace Deterministic.MigrateRunner;

internal interface IMigraterFactory
{
    bool TryGet(string name, out IMigrater migrater);
    IMigrater Get(string name);
}
