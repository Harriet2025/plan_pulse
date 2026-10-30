# AuraGoal in one container, for Coolify (or any Docker host): the React app and the PHP API on one address, plus the
# reminder worker. One address keeps sign-in cookies, the service worker and "install on your phone" simple.
#
#   /            the built React app (index.html, /assets, sw.js, the manifest, icons, the offline page)
#   /api/...     the PHP API (backend/api); /api/auth and /api/auth.php both work
#   /app/storage photos, chat files, sessions and push keys: mount a persistent volume here
#
# Settings come from environment variables (see env_config() in backend/db.php): DATABASE_URL (or the MYSQL* /
# AURAGOAL_DB_* variables), APP_URL, and SMTP_* for email.

# ---- 1. Build the React app ------------------------------------------------------------------------------------
FROM node:20-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. PHP + Apache ------------------------------------------------------------------------------------------
FROM php:8.2-apache

# PHP extensions: MySQL, images (photos and profile pictures) and photo orientation
RUN apt-get update \
 && apt-get install -y --no-install-recommends libjpeg62-turbo-dev libpng-dev libwebp-dev libfreetype6-dev \
 && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql gd exif \
 && rm -rf /var/lib/apt/lists/*

# Uploads: chat videos up to 50 MB
RUN { \
      echo 'upload_max_filesize=55M'; \
      echo 'post_max_size=60M'; \
      echo 'memory_limit=512M'; \
      echo 'expose_php=Off'; \
      echo 'display_errors=Off'; \
      echo 'log_errors=On'; \
    } > /usr/local/etc/php/conf.d/auragoal.ini

# The site: the built app at /, the API at /api. Nothing else in /app is reachable from the web.
# Caching: the app's fingerprinted files are cached for a year; index.html and sw.js are always checked again, so a
# new version reaches phones on their next visit.
RUN { \
      echo '<VirtualHost *:${PORT}>'; \
      echo '  DocumentRoot /app/public'; \
      echo '  <Directory /app/public>'; \
      echo '    Require all granted'; \
      echo '    AllowOverride None'; \
      echo '    Options -Indexes'; \
      echo '  </Directory>'; \
      echo '  Alias /api /app/backend/api'; \
      echo '  <Directory /app/backend/api>'; \
      echo '    Require all granted'; \
      echo '    AllowOverride None'; \
      echo '    Options -Indexes'; \
      echo '  </Directory>'; \
      echo '  RewriteEngine On'; \
      echo '  RewriteRule ^/api/([A-Za-z_]+)$ /app/backend/api/$1.php [L]'; \
      echo '  AddType application/manifest+json .webmanifest'; \
      echo '  <LocationMatch "^/assets/">'; \
      echo '    Header set Cache-Control "public, max-age=31536000, immutable"'; \
      echo '  </LocationMatch>'; \
      echo '  <LocationMatch "^/(index\.html|sw\.js|manifest\.webmanifest|offline\.html)?$">'; \
      echo '    Header set Cache-Control "no-cache"'; \
      echo '  </LocationMatch>'; \
      echo '  <LocationMatch "^/api/">'; \
      echo '    Header set Cache-Control "no-store"'; \
      echo '  </LocationMatch>'; \
      echo '  Header always set X-Content-Type-Options "nosniff"'; \
      echo '  Header always set Referrer-Policy "strict-origin-when-cross-origin"'; \
      echo '  ErrorLog /dev/stderr'; \
      echo '  CustomLog /dev/stdout combined'; \
      echo '</VirtualHost>'; \
    } > /etc/apache2/sites-available/000-default.conf \
 && a2enmod rewrite headers \
 && echo 'Listen ${PORT}' > /etc/apache2/ports.conf \
 && echo 'ServerTokens Prod' >> /etc/apache2/apache2.conf \
 && echo 'ServerSignature Off' >> /etc/apache2/apache2.conf

WORKDIR /app
COPY backend/ /app/backend/
COPY schema.sql /app/schema.sql
COPY docker-start.sh /app/docker-start.sh
COPY --from=web /web/dist /app/public
RUN rm -f /app/backend/config.local.php \
 && mkdir -p /app/storage && chown -R www-data:www-data /app/storage \
 && sed -i 's/\r$//' /app/docker-start.sh && chmod +x /app/docker-start.sh

ENV PORT=8080
EXPOSE 8080
CMD ["/app/docker-start.sh"]
