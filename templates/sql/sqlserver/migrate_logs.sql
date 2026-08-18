IF OBJECT_ID('dbo.migrate_logs', 'U') IS NULL
CREATE TABLE [migrate_logs] (
  [id] BIGINT IDENTITY(1,1) PRIMARY KEY,
  [migrate_name] NVARCHAR(255) NOT NULL,
  [direction] NVARCHAR(8) NOT NULL,
  [status] NVARCHAR(16) NOT NULL,
  [finished_at] DATETIME2,
  [duration_ms] INT,
  [error_message] NVARCHAR(MAX),
  [created] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
