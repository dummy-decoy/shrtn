#!/usr/bin/env node

const http = require('http');
const url = require('url');
const fs = require('fs');
const sqlite = require('sqlite3').verbose();

const db = new sqlite.Database('links.db');

const hash = function(str) {
    /*jshint bitwise:false */
    var i, l, hval = 0x811c9dc5;
    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return hval >>> 0;
}

const create_database  = function() {
    db.exec(' \
        create table if not exists links (url int not null primary key, target text); \
        create table if not exists stats (url int not null primary key, date_created datetime, use_count int, last_accessed datetime); \
        create unique index if not exists links_url_idx on links(url); \
        create unique index if not exists stats_url_idx on stats(url); \
    ');
}

const host = '0.0.0.0';
const port = process.argv[2] || 80;

const server = http.createServer(function (req, res) { 
    var call = url.parse(req.url, true);
    console.log('request: '+call.href);

    if ((call.pathname == '/') || (call.pathname == '/index.html')) {
        fs.readFile('./index.html', function (err, data) {
            if (err) {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end('404: File not found');
            } else {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(data);
            }
        });
    } else if (call.pathname == '/stats.html') {
        fs.readFile('./stats.html', function (err, data) {
            if (err) {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end('404: File not found');
            } else {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(data);
            }
        });
    } else if (call.pathname == '/api/shorten') {
        var target = call.query['target'];
        var hashed = hash(target);
        db.run('insert or replace into links(url, target) values (?, ?);', hashed, target, (err) => {
            console.log('shortened: '+hashed.toString(36)+' < '+target);
            res.writeHead(200, {'Content-Type': 'text/json'})
            res.end(JSON.stringify({'url': 'http://stochastique.io/'+hashed.toString(36), 'target': target}));            
        });
        db.run('insert or ignore into stats(url, date_created, use_count, last_accessed) values (?,datetime(\'now\'),0,datetime(\'now\'));', hashed);
    } else if (call.pathname == '/api/stats') {
        var hashed = url.parse(call.query['url'], false).pathname;
        hashed = parseInt(hashed.startsWith('/') ? hashed.substring(1) : hashed, 36);
        console.log('stats: '+hashed);
        db.get('select url, date_created, use_count, last_accessed from stats where url = ?;', hashed, (err, row) => {
            if (!row) {
                res.writeHead(404, {'Content-Type': 'text/json'});
                res.end(JSON.stringify({}));
            } else {
                console.log('stats: '+hashed);
                res.writeHead(200, {'Content-Type': 'text/json'})
                res.end(JSON.stringify({'url': 'http://stochastique.io/'+hashed, 'date_created': row.date_created, 'use_count': row.use_count, 'last_accessed': row.last_accessed}));
            }
        });
    } else {
        var hashed = parseInt(call.path.substring(1), 36);
        db.get('select target from links where url = ?;', hashed, (err, row) => {
            if (!row) {
                console.log('gone: '+call.path.substring(1));
                res.writeHead(410, {'Content-Type': 'text/plain'});
                res.end('gone');
            } else {
                console.log('redirect: '+call.path.substring(1)+' > '+row.target);
                res.writeHead(307, {'Location': row.target});
                res.end();
                db.run('update stats set use_count=use_count+1, last_accessed=datetime(\'now\') where url=?;', hashed);
            }
        });
    }
});

create_database();
server.listen(port, host, function () {
    console.log(`shrtn - link shortener service running on http://${host}:${port}`);
});
