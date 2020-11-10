const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = require('ws');
const Koa = require('koa');
const koaBody = require('koa-body');

const getTypesAmounts = require('./js/functions');

const app = new Koa();
const port = process.env.PORT || 7070;

app.use(koaBody({
  urlencoded: true,
  multipart: true,
}));

// CORS
app.use(async (ctx, next) => {
  const origin = ctx.request.get('Origin'); 
  
  if (!origin) {
    return await next();
  }  

  const headers = { 'Access-Control-Allow-Origin': '*', };
  
  if (ctx.request.method !== 'OPTIONS') {
    ctx.response.set({...headers});
    try {
      return await next();
    } catch (e) {
      e.headers = {...e.headers, ...headers};
      throw e;
    }
  }
  
  if (ctx.request.get('Access-Control-Request-Method')) {
    ctx.response.set({
      ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH',
    });
  
    if (ctx.request.get('Access-Control-Request-Headers')) {
      ctx.response.set('Access-Control-Allow-Headers', ctx.request.get('Access-Control-Allow-Request-Headers'));
    }
  
    ctx.response.status = 204;
  }
});

//WS
const server = http.createServer(app.callback()).listen(port);
const wsServer = new WS.Server({server});

let clients = [];
const ScrollPull = 10;
//let currentTopTask = null;
const pathToBD = './router/data/messages.json';

wsServer.on('connection', (ws, req) => {
  clients.push(ws);

  ws.on('message', (msg) => {
    const request = JSON.parse(msg);
    const { method, data } = request;
    const response = { method, };
    response.data = {};    
    const restClients = clients.filter((client) => client != ws);

    fs.readFile(pathToBD, (err, fd) => {    
      const decoder = new TextDecoder('utf-8');
      const str = decoder.decode(fd);
      const serverState = JSON.parse(str);
      let tasks;

      if (method === 'getState') {
        if (data.lastChange > serverState.conditions.lastChange) {
          // логика при оффлайн поддержке
          return;
        }

        const pinnedID = serverState.conditions.pinnedTask;
        const pinnedTask = serverState.tasks.find((task) => task.id === pinnedID);
        response.data.types = getTypesAmounts(serverState.tasks);        

        if (clients.length === 1) {
          tasks = serverState.tasks.slice(-ScrollPull);

          if (pinnedTask && !tasks.includes(pinnedTask) ) {
            tasks.unshift(pinnedTask);
          }

          tasks.forEach((task) => task.loaded = true);         
          const toFile = JSON.stringify(serverState);
          fs.writeFile(pathToBD, toFile, () => {});
        } else {
          tasks = serverState.tasks.filter(({ loaded }) => loaded);
        }

        response.data.state = {
          conditions: serverState.conditions,
          tasks,
          info: serverState.info,
        };
        ws.send(JSON.stringify(response));
        return;
      }

      if (method === 'scrollTasks') {

        tasks = serverState.tasks
          .filter(({ loaded }) => !loaded)
          .slice(-ScrollPull);

        if(!tasks.length) return;
        
        response.data = tasks;
        ws.send(JSON.stringify(response));
        restClients.forEach((client) => client.send(JSON.stringify(response)));

        tasks.forEach((task) => task.loaded = true);         
        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;
      }

      if (method === 'newTask') {
        serverState.tasks.push(data);
        serverState.conditions.lastChange = data.timestamp;
        response.data.newTask = data;

        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});

        restClients.forEach((client) => client.send(JSON.stringify(response)));
        return;
      }

      serverState.conditions.lastChange = data.lastChange;
      response.data = data;

      if (method === 'deleteTask') {
        serverState.tasks = serverState.tasks.filter((task) => task.id !== data.id);
        restClients.forEach((client) => client.send(JSON.stringify(response)));

        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }

      if (method === 'switchGeo') {
        serverState.conditions.geo = !serverState.conditions.geo;       
        restClients.forEach((client) => client.send(JSON.stringify(response)));

        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }

      if (method === 'switchFavorite') {
        const favTask = serverState.tasks.find((task) => task.id === data.id);
        favTask.isFavorite = !favTask.isFavorite;         
        restClients.forEach((client) => client.send(JSON.stringify(response)));

        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }

      if (method === 'editTask') {
        let id = serverState.tasks.findIndex((task) => task.id === data.id);
        serverState.tasks[id] = data.task;
        restClients.forEach((client) => client.send(JSON.stringify(response)));
        
        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }

      if (method === 'switchPinnedOn') {       
        serverState.conditions.pinnedTask = data.id;
        serverState.tasks.find((task) => task.id === data.id).isPinned = true;
        restClients.forEach((client) => client.send(JSON.stringify(response))); 

        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }

      if (method === 'switchPinnedOff') {
        serverState.conditions.pinnedTask = null; 
        serverState.info = [];       
        serverState.tasks.find(({ isPinned }) => isPinned).isPinned = false;
        restClients.forEach((client) => client.send(JSON.stringify(response)));

        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }  

      if (method === 'showInfoPanel') {
        const infoTasks = data.map((id) => serverState.tasks
            .find((task) => task.id === id));

        serverState.info = infoTasks;
        
        restClients.forEach((client) => client.send(JSON.stringify(response)));
        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }  

      if (method === 'closeInfoPanel') {
        serverState.info = [];
        
        restClients.forEach((client) => client.send(JSON.stringify(response)));
        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }

      if (method === 'getFavorite') {
        const favoriteTasks = serverState.tasks.filter(({ isFavorite }) => isFavorite);
        serverState.info = favoriteTasks;
        response.data.favorites = favoriteTasks;
        
        clients.forEach((client) => client.send(JSON.stringify(response)));
        const toFile = JSON.stringify(serverState);
        fs.writeFile(pathToBD, toFile, () => {});
        return;       
      }    
    });
  });

  ws.on('close', () => {
    clients = clients.filter((client) => client !== ws);

    if (clients.length) return;

    const file = fs.readFileSync(pathToBD);
    const decoder = new TextDecoder('utf-8');
    const str = decoder.decode(file);
    const serverState = JSON.parse(str);

    serverState.tasks.forEach((task) => {
      task.loaded = false;      
    });

    const toFile = JSON.stringify(serverState);
    fs.writeFile(pathToBD, toFile, () => {});
  });
});
