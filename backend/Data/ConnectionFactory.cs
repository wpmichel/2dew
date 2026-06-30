using System.Data;
using Microsoft.Data.Sqlite;

namespace Backend.Data;

public class ConnectionFactory
{
    private readonly string _connectionString;

    public ConnectionFactory(string connectionString) => _connectionString = connectionString;

    public IDbConnection Create()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        // Enforce the Tasks->Users cascade; SQLite leaves foreign keys off per-connection.
        using var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON;";
        pragma.ExecuteNonQuery();
        return connection;
    }
}
