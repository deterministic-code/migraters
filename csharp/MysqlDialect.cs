using System.Data.Common;
using MySqlConnector;

namespace Deterministic.MigrateRunner;

internal sealed class MysqlDialect : SqlDialectBase
{
    public override string Name => "mysql";

    public override IReadOnlyList<string> ConnectionEnvironmentVariables { get; } =
        new[] { "MYSQL_URL", "DATABASE_URL" };

    public override string MigratesDdl => SqlTemplates.Read(Name, "migrates");
    public override string MigrateLogsDdl => SqlTemplates.Read(Name, "migrate_logs");

    // MySQL DDL auto-commits, so wrapping apply + catalog write gives no atomicity.
    public override bool UseTransaction => false;

    public override string NormalizeConnectionString(string connection)
    {
        if (!ConnectionStringUrl.LooksLikeUrl(connection, "mysql"))
        {
            return connection;
        }
        var uri = new Uri(connection);
        var builder = new MySqlConnectionStringBuilder
        {
            Server = uri.Host,
            Port = (uint)(uri.Port > 0 ? uri.Port : 3306),
        };
        var (user, pass) = ConnectionStringUrl.SplitUserInfo(uri.UserInfo);
        if (user is not null) { builder.UserID = user; }
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
        new MySqlConnection(connectionString);

    public override void AddParameter(DbCommand command, string name, object value) =>
        Bind(command, $"@{name}", value);

    protected override string QuoteIdent(string ident) => $"`{ident}`";
    protected override string Placeholder(string name) => $"@{name}";
}
