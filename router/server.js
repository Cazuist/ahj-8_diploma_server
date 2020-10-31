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

wsServer.on('connection', (ws, req) => {
  ws.on('message', (msg) => {
    const request = JSON.parse(msg);
    const { method, data } = request;
    let response = { method, };
    const path = './router/data/messages.json';
    
    fs.readFile(path, (err, fd) => {    
      const decoder = new TextDecoder('utf-8');
      const str = decoder.decode(fd);
      const state = JSON.parse(str);

      if (method === 'newTask') {
        state.tasks.push(data);
        state.conditions.lastChange = data.timestamp;
        const toFile = JSON.stringify(state);

        fs.writeFile(path, toFile, () => {return;});
        return;
      }      

      if (method === 'deleteTask') {
        state.conditions.lastChange = data.lastChange;
        state.tasks = state.tasks.filter((task) => task.id !== data.id); 
        
        const toFile = JSON.stringify(state);        
        fs.writeFile(path, toFile, () => {return;});
        return;       
      }

      if (method === 'editTask') {
        state.conditions.lastChange = data.lastChange;
        let id = state.tasks.findIndex((task) => task.id === data.id);
        state.tasks[id] = data.task;
        
        const toFile = JSON.stringify(state);
        fs.writeFile(path, toFile, () => {return;});
        return;       
      }

      if (method === 'switchGeo') {
        state.conditions.lastChange = data.lastChange;
        state.conditions.geo = !state.conditions.geo;
        
        const toFile = JSON.stringify(state);
        fs.writeFile(path, toFile, () => {return;});
        return;       
      }

      if (method === 'switchFavorite') {
        state.conditions.lastChange = data.lastChange;
        const favTask = state.tasks.find((task) => task.id === data.id);
        favTask.isFavorite = !favTask.isFavorite;

        const toFile = JSON.stringify(state);
        fs.writeFile(path, toFile, () => {return;});
        return;       
      }

      if (method === 'switchPinnedOn') {
        state.conditions.lastChange = data.lastChange;
        state.conditions.pinnedTask = data.id;
        state.tasks.find((task) => task.id === data.id).isPinned = true;               
      
        const toFile = JSON.stringify(state);
        fs.writeFile(path, toFile, () => {return;});
        return;       
      }

      if (method === 'switchPinnedOff') {
        state.conditions.lastChange = data.lastChange;
        state.conditions.pinnedTask = null;
        
        state.tasks.find(({ isPinned }) => isPinned).isPinned = false;               
      
        const toFile = JSON.stringify(state);
        fs.writeFile(path, toFile, () => {return;});
        return;       
      }

      if (method === 'getState') {
        state.tasks = state.tasks.slice(-10);
        response.data = state;
        response.types = getTypesAmounts(state.tasks);
      }

      if (method === 'scrollTasks') {
        const id = data.id;
        const idxTo = state.tasks.findIndex((task) => task.id === id);

        if(!idxTo) return;
        
        const idxFrom = idxTo - 10 >= 0 ? idxTo - 10 : 0;
        const newSlice = state.tasks.slice(idxFrom, idxTo);
        response.data = newSlice;
      }

      ws.send(JSON.stringify(response));
    });
  });
});
