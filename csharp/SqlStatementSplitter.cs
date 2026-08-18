using System.Text;

namespace Deterministic.MigrateRunner;

internal static class SqlStatementSplitter
{
    // Block-aware: BEGIN/END (case-insensitive) inside a CREATE TRIGGER body is tracked so the inner UPDATE's `;` does not terminate the outer statement (sqlite error code 1 "incomplete input" otherwise).
    public static List<string> Split(string sql)
    {
        var outList = new List<string>();
        var buf = new StringBuilder();
        var inSingle = false;
        var inDouble = false;
        var inLine = false;
        var inBlock = false;
        string? dollarTag = null;
        var blockDepth = 0;
        var word = new StringBuilder();
        for (var i = 0; i < sql.Length; i++)
        {
            var c = sql[i];
            char? next = i + 1 < sql.Length ? sql[i + 1] : null;
            if (!inLine && !inBlock && dollarTag is null && !inSingle && !inDouble)
            {
                if (c == '-' && next == '-')
                {
                    inLine = true;
                    buf.Append(c);
                    continue;
                }
                if (c == '/' && next == '*')
                {
                    inBlock = true;
                    buf.Append(c);
                    continue;
                }
                if (c == '$')
                {
                    var j = i + 1;
                    while (j < sql.Length && sql[j] != '$') { j++; }
                    if (j < sql.Length)
                    {
                        var tag = sql.Substring(i, j - i + 1);
                        dollarTag = tag;
                        buf.Append(tag);
                        i = j;
                        continue;
                    }
                }
            }
            if (inLine)
            {
                buf.Append(c);
                if (c == '\n') { inLine = false; }
                continue;
            }
            if (inBlock)
            {
                buf.Append(c);
                if (c == '*' && next == '/')
                {
                    buf.Append('/');
                    inBlock = false;
                    i++;
                }
                continue;
            }
            if (dollarTag is not null)
            {
                buf.Append(c);
                if (c == '$')
                {
                    var end = i + dollarTag.Length;
                    if (end <= sql.Length)
                    {
                        var candidate = sql.Substring(i, dollarTag.Length);
                        if (candidate == dollarTag)
                        {
                            for (var k = i + 1; k < end; k++) { buf.Append(sql[k]); }
                            dollarTag = null;
                            i = end - 1;
                        }
                    }
                }
                continue;
            }
            if (inSingle)
            {
                buf.Append(c);
                if (c == '\'') { inSingle = false; }
                continue;
            }
            if (inDouble)
            {
                buf.Append(c);
                if (c == '"') { inDouble = false; }
                continue;
            }
            if (c == '\'') { inSingle = true; buf.Append(c); continue; }
            if (c == '"') { inDouble = true; buf.Append(c); continue; }
            if (char.IsLetter(c) || c == '_')
            {
                word.Append(c);
                buf.Append(c);
                continue;
            }
            if (word.Length > 0)
            {
                var upper = word.ToString().ToUpperInvariant();
                if (upper == "BEGIN") { blockDepth++; }
                else if (upper == "END" && blockDepth > 0) { blockDepth--; }
                word.Clear();
            }
            if (c == ';' && blockDepth == 0)
            {
                buf.Append(c);
                var s = buf.ToString().Trim();
                if (s.Length > 0) { outList.Add(s); }
                buf.Clear();
                continue;
            }
            buf.Append(c);
        }
        var tail = buf.ToString().Trim();
        if (tail.Length > 0) { outList.Add(tail); }
        return outList;
    }
}
