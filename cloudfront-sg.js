#!/usr/bin/env node

var Seq = require('seq');

var argv = require('optimist')
    .usage('Update AWS security groups with cloudfront IP\'s.\nUsage: $0 arg1..argn')
    .demand(1)

    .describe('arg1..argn', 'One or more security group ID\'s')
    .argv;

argv.securityGroups = argv._;

var cloudfrontIps = {};

Seq()
    .par(function () {
        var _self = this;
        var request = require("request");
        request('https://ip-ranges.amazonaws.com/ip-ranges.json', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                //   console.log(body) // Show the HTML for the Google homepage.
                 cloudfrontIps = JSON.parse(response.body);
                _self();
            } else {
                _self("Can't divide by zero");
            }
        })
    })
    .par(function () {
        var _self = this;
        console.log('par');
        _self();
    })
    .seq(function () {
        console.log('Loaded');
        console.log(cloudfrontIps.prefixes);
    }).catch(function (err) {
        console.error(err.stack ? err.stack : err)
    });

console.log('Update AWS security groups %s with cloudfront IP\'s', argv.securityGroups.join(',', argv.securityGroups));




