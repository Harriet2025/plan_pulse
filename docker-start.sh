#!/bin/sh
# Starts AuraGoal: makes sure the storage volume is usable, creates the tables in an empty database,
# runs the reminder worker in the background (restarting it if it stops), then serves the app and API with Apache.
set -e

mkdir -p /app/storage
chown -R www-data:www-data /app/storage

su -s /bin/sh www-data -c "php /app/backend/install.php"

# The worker sends push reminders and morning emails. Run it as www-data so the files it writes stay readable.
(
  while true; do
    su -s /bin/sh www-data -c "php /app/backend/worker.php" || true
    echo "Reminder worker stopped; restarting in 10 seconds" >&2
    sleep 10
  done
) &

exec apache2-foreground
