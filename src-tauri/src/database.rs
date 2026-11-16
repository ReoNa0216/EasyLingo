use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
pub struct Statement {
    query: String,
    values: Vec<Value>,
}

// All statements use one connection and one transaction. A failed restore leaves
// the previous database intact, including settings and learning history.
async fn run_batch(pool: &SqlitePool, statements: Vec<Statement>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            query = match value {
                Value::Null => query.bind(Option::<String>::None),
                Value::Bool(v) => query.bind(v),
                Value::Number(v) if v.is_i64() => query.bind(v.as_i64().unwrap()),
                Value::Number(v) => query.bind(v.as_f64().ok_or("Invalid number")?),
                Value::String(v) => query.bind(v),
                _ => return Err("Unsupported SQL value".into()),
            };
        }
        query.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn database_batch(
    databases: tauri::State<'_, DbInstances>,
    db: String,
    statements: Vec<Statement>,
) -> Result<(), String> {
    let databases = databases.0.read().await;
    let DbPool::Sqlite(pool) = databases.get(&db).ok_or("Database not loaded")?;
    run_batch(pool, statements).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_batch_rolls_back_all_changes() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
            sqlx::query("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)").execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO items VALUES (1, 'original')").execute(&pool).await.unwrap();
            let result = run_batch(&pool, vec![
                Statement { query: "DELETE FROM items".into(), values: vec![] },
                Statement { query: "INSERT INTO items VALUES (?, ?)".into(), values: vec![1.into(), "new".into()] },
                Statement { query: "INSERT INTO items VALUES (?, ?)".into(), values: vec![1.into(), "duplicate".into()] },
            ]).await;
            assert!(result.is_err());
            let value: String = sqlx::query_scalar("SELECT value FROM items WHERE id = 1").fetch_one(&pool).await.unwrap();
            assert_eq!(value, "original");
            pool.close().await;
        });
    }
}
