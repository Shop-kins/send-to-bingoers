var AWS = require('aws-sdk');

require('aws-sdk/clients/apigatewaymanagementapi');


AWS.config.update({region: 'us-east-2'});
exports.handler = function(event, context, callback) {
  var room = JSON.parse(event.body).room
  var evContext = event.requestContext 
  let connectionData;
  var ddb = new AWS.DynamoDB();
  
  var scanParams = {
    TableName:"GridConnections",
    ProjectionExpression: "id, #yr, colour_count",
    FilterExpression: "#yr = :yyyy",
    ExpressionAttributeNames:{
        "#yr": "room"
    },
    ExpressionAttributeValues: {
        ":yyyy": { S: room }
    }
};
ddb.scan(scanParams, async (err, data) => {
  console.log(err)
  try {
   
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  var count = data.Items.find(element => element.id.S == event.requestContext.connectionId).colour_count;
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  const postCalls = data.Items.map(async ({ id }) => {
    const postData = JSON.stringify({position: JSON.parse(event.body).position, colour_count: count.S});
    if( event.requestContext.connectionId != id.S){
    try {     
        console.log("Posting " + postData + " to " + id.S)
        apigwManagementApi.postToConnection({ ConnectionId: id.S, Data: postData }, function(err, data){
          if (err) {
             if(err.statusCode == 410){
               console.log(`Found stale connection, deleting ${id}`);
               ddb.deleteItem({ TableName: "GridConnections", Key: { id } }).promise();
             } else {
               console.log("ERROR " + err)
             }
          }// an error occurred
          else console.log(data);           // successful response
        });
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${id}`);
        await ddb.deleteItem({ TableName: "GridConnections", Key: { id } }).promise();
      } else {
        throw e;
      }
    }
    } else {
      console.log("Sending nothing to creator " + id.S)
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    callback(null, { "statusCode": 500, "body": e.stack, "isBase64Encoded": false, "headers":{"Access-Control-Allow-Origin": "*"}});
  }

  
});
 callback(null, { "statusCode": 200, "body": 'Received', "isBase64Encoded": false, "headers":{"Access-Control-Allow-Origin": "*"}});
};
