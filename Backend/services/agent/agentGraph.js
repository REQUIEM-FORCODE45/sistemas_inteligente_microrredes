const { StateGraph, END } = require('@langchain/langgraph');
const { GraphState } = require('./graphState');
const { routerNode, routeByAnalisis, RUTA_ALERTA, RUTA_OPTIMIZACION } = require('./nodes/routerNode');
const { alertNode } = require('./nodes/alertNode');
const { optimizationNode } = require('./nodes/optimizationNode');
const { formatterNode } = require('./nodes/formatterNode');
const { START } = require('@langchain/langgraph');

let compiledGraph = null;

const buildAgentGraph = () => {
  const graph = new StateGraph(GraphState)
    .addNode('router', routerNode)
    .addNode(RUTA_ALERTA, alertNode)
    .addNode(RUTA_OPTIMIZACION, optimizationNode)
    .addNode('formatter', formatterNode)
    .addEdge(START, 'router')
    .addConditionalEdges('router', routeByAnalisis, {
      [RUTA_ALERTA]: RUTA_ALERTA,
      [RUTA_OPTIMIZACION]: RUTA_OPTIMIZACION,
    })
    .addEdge(RUTA_ALERTA, 'formatter')
    .addEdge(RUTA_OPTIMIZACION, 'formatter')
    .addEdge('formatter', END);

  console.log(' LangGraph: Grafo compilado con nodos: router → alerta|optimizacion → formatter');
  return graph.compile();
};

const getAgentGraph = () => {
  if (!compiledGraph) {
    compiledGraph = buildAgentGraph();
  }
  return compiledGraph;
};

module.exports = { buildAgentGraph, getAgentGraph };
