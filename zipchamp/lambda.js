let AWS = require('aws-sdk');
let JSZip = require("jszip");
let fs = require("fs");

const s3 = new AWS.S3();

exports.handler = function (event, context, callback) {
    /* The request payload will take the following format:
    {
        "path": "path/to/zip/file/within/bucket",
        "changes": {
            "path/to/new/file/1": "content for file 1",
            "path/to/existing/file/2": "new content of file 2",
            "path/to/deleted/file/3": null
        }
    }
     */

    let changes = event.changes;
    let modified = 0, removed = 0;

    console.log(`Fetching ${event.path}`);
    s3.getObject({
        'Bucket': "hosted-archives",
        'Key': event.path
    }).promise()
        .then(data => {
            let jszip = new JSZip();
            console.log(`Opening ${event.path}`);
            jszip.loadAsync(data.Body).then(zip => {
                console.log(`Opened ${event.path} as zip`);
                Object.keys(changes).forEach(name => {
                    if (changes[name] !== null) {
                        console.log(`Modify ${name}`);
                        zip.file(name, changes[name]);
                        modified++;
                    } else {
                        console.log(`Remove ${name}`);
                        zip.remove(name);
                        removed++;
                    }
                });

                let tmpPath = `/tmp/${event.path}`
                console.log(`Writing to temp file ${tmpPath}`);
                zip.generateNodeStream({ streamFiles: true })
                    .pipe(fs.createWriteStream(tmpPath))
                    .on('error', err => callback(err))
                    .on('finish', function () {
                        console.log(`Uploading to ${event.path}`);
                        s3.putObject({
                            "Body": fs.createReadStream(tmpPath),
                            "Bucket": "hosted-archives",
                            "Key": event.path,
                            "Metadata": {
                                "Content-Length": String(fs.statSync(tmpPath).size)
                            }
                        })
                            .promise()
                            .then(data => {
                                console.log(`Successfully uploaded ${event.path}`);
                                callback(null, {
                                    added: added,
                                    modified: modified,
                                    removed: removed
                                });
                            })
                            .catch(err => {
                                callback(err);
                            });
                    });
            })
                .catch(err => {
                    callback(err);
                });
        })
        .catch(err => {
            callback(err);
        });
}