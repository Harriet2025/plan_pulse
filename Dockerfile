# AuraGoal's back end (PHP API + reminder worker) for Railway or any Docker host.
# The React front end is built and served separately (Vercel), which forwards /api/* here.
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

# Only backend/api is reachable from the web; the rest of backend/ (helpers, worker, installer) is not.
# /api/auth and /api/auth.php both work (the website calls them without .php, which some hosts block).
RUN { \
      echo '<VirtualHost *:${PORT}>'; \
      echo '  DocumentRoot /app/backend'; \
      echo '  RewriteEngine On'; \
      echo '  RewriteRule ^/api/([A-Za-z_]+)$ /api/$1.php [L]'; \
      echo '  <Directory /app/backend>'; \
      echo '    Require all denied'; \
      echo '    AllowOverride None'; \
      echo '  </Directory>'; \
      echo '  <Directory /app/backend/api>'; \
      echo '    Require all granted'; \
      echo '  </Directory>'; \
      echo '  ErrorLog /dev/stderr'; \
      echo '  CustomLog /dev/stdout combined'; \
      echo '</VirtualHost>'; \
    } > /etc/apache2/sites-available/000-default.conf \
 && a2enmod rewrite \
 && echo 'Listen ${PORT}' > /etc/apache2/ports.conf \
 && echo 'ServerTokens Prod' >> /etc/apache2/apache2.conf \
 && echo 'ServerSignature Off' >> /etc/apache2/apache2.conf

WORKDIR /app
COPY backend/ /app/backend/
COPY schema.sql /app/schema.sql
COPY docker-start.sh /app/docker-start.sh
RUN rm -f /app/backend/config.local.php \
 && mkdir -p /app/storage && chown -R www-data:www-data /app/storage \
 && chmod +x /app/docker-start.sh

# Railway sets PORT; 8080 when run anywhere else
ENV PORT=8080
EXPOSE 8080
CMD ["/app/docker-start.sh"]
