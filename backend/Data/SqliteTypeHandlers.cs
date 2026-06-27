using System.Data;
using Dapper;

namespace Backend.Data;

// SQLite stores Guids as TEXT with no Guid affinity, so Dapper needs an explicit handler to
// read a column back into a Guid. (DateTimes are handled natively by Microsoft.Data.Sqlite as
// TEXT; we tag them UTC at the API boundary in TaskResponse.From.)
public static class SqliteTypeHandlers
{
    public static void Register()
    {
        SqlMapper.AddTypeHandler(new GuidHandler());
    }

    private class GuidHandler : SqlMapper.TypeHandler<Guid>
    {
        public override void SetValue(IDbDataParameter parameter, Guid value)
        {
            parameter.DbType = DbType.String;
            parameter.Value = value.ToString();
        }

        public override Guid Parse(object value) => Guid.Parse((string)value);
    }
}
