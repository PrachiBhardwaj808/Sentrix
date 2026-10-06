from django.db import migrations


def create_spatial_feature_store(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sentrix_spatial_features (
                id bigserial PRIMARY KEY,
                collection varchar(32) NOT NULL,
                record_id varchar(200) NOT NULL,
                payload jsonb NOT NULL,
                geom geometry(Geometry, 4326) NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT sentrix_spatial_features_collection_record_uniq
                    UNIQUE (collection, record_id)
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS sentrix_spatial_features_geom_gist "
            "ON sentrix_spatial_features USING GIST (geom)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS sentrix_spatial_features_collection_idx "
            "ON sentrix_spatial_features (collection)"
        )


def drop_spatial_feature_store(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        with schema_editor.connection.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS sentrix_spatial_features")


class Migration(migrations.Migration):
    dependencies = [("app", "0001_initial")]

    operations = [
        migrations.RunPython(create_spatial_feature_store, drop_spatial_feature_store),
    ]
