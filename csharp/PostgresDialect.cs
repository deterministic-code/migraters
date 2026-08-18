using System.Data.Common;
using Npgsql;

namespace Deterministic.MigrateRunner;

internal sealed class PostgresDialect : SqlDialectBase
{
    public override string Name => "postgres";

    public override IReadOnlyList<string> ConnectionEnvironmentVariables { get; } =
        new[] { "PG_CONNECTION_STRING", "DATABASE_URL" };

    public override string MigratesDdl => SqlTemplates.Read(Name, "migrates");
    public override string MigrateLogsDdl => SqlTemplates.Read(Name, "migrate_logs");
    public override bool UseTransaction => true;

    public override string NormalizeConnectionString(string connection)
    {
        if (!ConnectionStringUrl.LooksLikeUrl(connection, "postgres", "postgresql"))
        {
            return connection;
        }
        var uri = new Uri(connection);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
        };
        var (user, pass) = ConnectionStringUrl.SplitUserInfo(uri.UserInfo);
        if (user is not null) { builder.Username = user; }
        if (pass is not null) { builder.Password = pass; }
        var db = ConnectionStringUrl.TrimLeadingSlash(uri.AbsolutePath);
        if (!string.IsNullOrEmpty(db)) { builder.Database = db; }
        foreach (var kv in ConnectionStringUrl.ParseQuery(uri.Query))
        {
            builder[kv.Key] = kv.Value;
        }
        return builder.ToString();
    }

    public override DbConnection CreateConnection(string connectionString) =>
        new NpgsqlConnection(connectionString);

    public override void AddParameter(DbCommand command, string name, object value) =>
        Bind(command, name, value);

    protected override string QuoteIdent(string ident) => $"\"{ident}\"";
    protected override string Placeholder(string name) => $"@{name}";
}
