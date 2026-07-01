FROM pgbouncer/pgbouncer:1.15.0

COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY userlist.txt /etc/pgbouncer/userlist.txt

USER postgres
EXPOSE 6432

ENTRYPOINT ["/opt/pgbouncer/pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
