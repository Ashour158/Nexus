FROM edoburu/pgbouncer:v1.24.1-p1

COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY userlist.txt /etc/pgbouncer/userlist.txt
COPY docker-entrypoint.sh /docker-entrypoint.sh

# The entrypoint regenerates userlist.txt from DATABASE_URL at start, so the
# runtime user must be able to write it. Make the script executable and the
# config dir writable, then drop back to the unprivileged postgres user.
USER root
RUN chmod +x /docker-entrypoint.sh && chown -R postgres /etc/pgbouncer
USER postgres

EXPOSE 6432

ENTRYPOINT ["/docker-entrypoint.sh"]
