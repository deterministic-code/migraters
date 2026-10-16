namespace Deterministic.MigrateRunner;

internal sealed class MigraterFactory(ISqlDialectFactory dialects) : IMigraterFactory
{
    public bool TryGet(string name, out IMigrater migrater)
    {
        if (!dialects.TryGet(name, out var dialect))
        {
            migrater = null!;
            return false;
        }
        migrater = new Migrater(dialect);
        return true;
    }

    public IMigrater Get(string name)
    {
        if (TryGet(name, out var migrater))
            return migrater;
        throw new InvalidOperationException($"Unknown SQL dialect \"{name}\".");
    }
}
