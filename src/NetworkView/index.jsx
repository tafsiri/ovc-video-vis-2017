import React, { Component } from 'react';
import * as d3 from 'd3';
import flatten from 'lodash.flatten';
import uniq from 'lodash.uniq';
import debounce from 'lodash.debounce';
import hull from 'hull.js';
import jquery from 'jquery';
import ss from 'simple-statistics';

import './index.css'

// From d3.jetpack
function tspans(lines, lh) {
  return this.selectAll('tspan')
      .data(function(d) {
        return (typeof(lines) === 'function' ? lines(d) : lines)
          .map(function(l) {
            return { line: l, parent: d };
          });
      })
      .enter()
    .append('tspan')
      .text(function(d) { return d.line; })
      .attr('x', 0)
      .attr('dy', function(d, i) { return i ? (typeof(lh) === 'function' ? lh(d.parent, d.line, i) : lh) || 15 : 0; });
}

function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

const transitionTime = 150;

export default class NetworkView extends Component {

  static defaultProps = {
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    nodeRadius: 40,
  }

  constructor(props) {
    super(props)
    this.nodes = props.metadata;
    // append function from d3.jectpack to selection proto
    d3.selection.prototype.tspans = tspans

    this.state = {
      hightlightNode: undefined,
      highlightTag: undefined,
      selectTag: undefined,
    };

    this.highlight = this.highlight.bind(this);
    this.unhighlight = this.unhighlight.bind(this);
    this.select = this.select.bind(this);

    this.hoverTag = this.hoverTag.bind(this);
    this.unHoverTag = this.unHoverTag.bind(this);
    this.toggleSelectTag = this.toggleSelectTag.bind(this);

    this.udpateDimensions = debounce(this.udpateDimensions.bind(this), 100);
  }

  componentDidMount() {
    this.prevWidth = this.props.width;
    this.setupSVG();
    this.setup();
    this.runSimulation();
    this.renderGraph();

    window.addEventListener("resize", this.udpateDimensions);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.udpateDimensions);
  }

  componentDidUpdate() {
    this.renderGraph();
  }

  udpateDimensions() {
    const { width } = this.props;

    if (width !== this.prevWidth) {
      this.setup();
      this.runSimulation();
      this.renderGraph();

      this.prevWidth = width;
    }
  }


  getNodes() {
    return this.nodes;
  }

  getLinks() {
    const nodes = this.getNodes();
    const links = [];

    let zScoreThreshold = 1.5;
    // zScoreThreshold = 1.25;

    // this will be an undirected graph so keep track of edges we have
    // already processed and skip them.
    const processedPairs = []

    for(let i = 0; i < nodes.length; i++) {
      nodes[i].linked = new Set();
    }

    for(let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const similarities = nodes[i].similarities;
      for(let j = 0; j < similarities.length; j++) {
        const targetNode = nodes[j]
        const pairId = [node.id, targetNode.id].sort().join('-')
        if (i === j) {
          continue;
        }

        // Analyze the distributions of similarities for this talk
        const simDist = similarities.filter(d => d < 0.9)
        const simDistMean = ss.mean(simDist)
        const simDistStdDev = ss.standardDeviation(simDist)

        const weight = similarities[j];
        const zScore = ss.zScore(weight, simDistMean, simDistStdDev);

        if (zScore >= zScoreThreshold) { // TODO make this symmetrical
          if (!processedPairs.includes(pairId)) {
            links.push({source: i, target: j, weight });
            processedPairs.push(pairId);
          }
          // we keep track of this for easy interaction handlers regardless
          // of direction.
          node.linked.add(targetNode);
          targetNode.linked.add(node);
        }
      }
    }

    return links;
  }

  setup() {
    const {
      width,
      height,
      nodeRadius,
    } = this.props;


    const nodes = this.getNodes();
    const links = this.getLinks();

    const linkForce = d3.forceLink()
      .distance((l) => {
        return (350 * (1 - l.weight)) + 22;
      })
      .links(links);

    const chargeForce = d3.forceManyBody()
      .strength(-60)

    const collisionForce = d3.forceCollide()
      .radius(nodeRadius * 2.0);

    const centeringForce = d3.forceCenter()
      .x(width / 2)
      .y(height / 2);

    const boundingPadding = 73; // 75
    const boundingForce = (alpha) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (node.x - nodeRadius < boundingPadding) {
          node.x = nodeRadius + boundingPadding;
        }

        if (node.x + nodeRadius > width - boundingPadding) {
          node.x = width - nodeRadius - boundingPadding;
        }

        if (node.y - nodeRadius < boundingPadding) {
          node.y = nodeRadius + (boundingPadding / 2);
        }

        if (node.y + nodeRadius > height - boundingPadding) {
          node.y = height - nodeRadius - boundingPadding;
        }
      }
    }

    const simulation = d3.forceSimulation(nodes)
      .velocityDecay(0.2)
      // .alphaMin(0.5)
      .force('link', linkForce)
      .force('charge', chargeForce)
      .force('collision', collisionForce)
      .force('center', centeringForce)
      .force('bounding', boundingForce);

    this.simulation = simulation;
    this.simulationLinks = links; // save off the d3 processed links


  }

  setupSVG() {
    const {
      metadata,
      nodeRadius
    } = this.props;

    const g = d3.select(this.g);

    this.hullsG = g.append('g')
      .attr('class', 'hulls');

    this.edgesG = g.append('g')
      .attr('class', 'edges');

    this.nodesG = g.append('g')
      .attr('class', 'nodes');

    this.titlesG = g.append('g')
      .attr('class', 'titles');


    const nodes = this.getNodes();
    let tags = uniq(flatten(nodes.map(d => d.tags))).sort();

    const defs = d3.select(this.svg).append('defs');

    const containerVisible = this.container.offsetParent !== null;

    defs.selectAll('pattern.portrait')
      .data(metadata)
      .enter()
        .append('pattern')
          .attr('class', 'portrait')
          .attr('id', d => `${d.id}-img`)
          .attr('patternUnits', 'objectBoundingBox')
          .attr('width', 1)
          .attr('height', 1)
        .append('image')
          .attr('xlink:href', d => `/img/portraits/${d.portrait}`)
          .attr('x', d => -10)
          .attr('y', d => -10)
          .attr('width', d => (nodeRadius * 2) + 20)
          .attr('height', d => (nodeRadius * 2) + 20)

    defs.selectAll('pattern.gif')
      .data(metadata)
      .enter()
        .append('pattern')
          .attr('class', 'gif')
          .attr('id', d => `${d.id}-gif`)
          .attr('patternUnits', 'objectBoundingBox')
          .attr('width', 1)
          .attr('height', 1)
        .append('image')
          .attr('xlink:href', d => {
            // if the container was not visible on first load (e.g. on a smaller device) don't even
            // download the gifs.
            return containerVisible ? `/img/gifs/faces/${d.id}.gif` : `/img/portraits/${d.portrait}`;
          })
          .attr('x', d => -10)
          .attr('y', d => -20)
          .attr('width', d => (nodeRadius * 2) + 30)
          .attr('height', d => (nodeRadius * 2) + 30)

    const gradEnter = defs.selectAll('linearGradient')
      .data(tags)
      .enter();

    const grad = gradEnter.append('linearGradient')
          .attr('id', d => `${d.id}-grad`)
          // .attr("gradientUnits", "userSpaceOnUse")
          .attr('x1', () => getRandom(0.0, 0.3))
          .attr('y1', () => getRandom(0.0, 0.2))
          .attr('x2', () => 1)
          .attr('y2', () => 1)

    grad.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#D39F4C');

    grad.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#88642F');
  }

  runSimulation() {
    const simulationTicks = 500;
    for (let i = 0; i < simulationTicks; i++) {
      this.simulation.tick();
    }
  }

  highlight(d) {
    this.setState({
      hightlightNode: d,
    })
  }

  unhighlight() {
    this.setState({
      hightlightNode: undefined,
    })
  }

  select(d) {
    const target = document.getElementById(`${d.id}-video-item`);

    if (jquery) {
      // on the main site, jquery is present TODO see if we can use that copy.
      // This code matches the smooth scroll code used on the site.
      const $target = jquery(target);
      if ($target.length) {
        jquery('html,body').animate({
          scrollTop: $target.offset().top - 60
        }, 1000, function() {
          window.location.hash = `${d.id}-video-item`;
        });
      }
    } else {
      target.scrollIntoView(true);
    }
  }

  hoverTag(d) {
    this.setState({
      hightlightTag: d,
    })
  }

  unHoverTag() {
    this.setState({
      hightlightTag: undefined,
    })
  }

  toggleSelectTag(d) {
    const currentSelectTag = this.state.selectTag;

    if(currentSelectTag && currentSelectTag === d) {
      this.setState({
        selectTag: undefined,
      })
    } else {
      this.setState({
        selectTag: d,
      })
    }
  }

  getHull(tag, nodes) {
    const {
      nodeRadius,
    } = this.props;

    const offset = nodeRadius + 20;
    const concavity = 400;

    const taggedNodes = nodes.filter(d => d.tags.includes(tag));
    let points = taggedNodes.map(d => {
      // Turn each point into a box so that we can draw a 'feathered' line
      // around out selection
      return [
        [d.x - offset, d.y - offset],
        [d.x - offset, d.y + offset],
        [d.x + offset, d.y - offset],
        [d.x + offset, d.y + offset],
      ]
    });

    points = flatten(points);
    if (points.length > 2) {
      return hull(points, concavity)
    }
  }

  renderGraph() {
    this.renderNodes();
    this.renderEdges();
    this.renderTitles();
    this.renderTagHulls();
  }

  renderNodes() {
    const nodes = this.getNodes();

    const {
      nodeRadius
    } = this.props;

    const {
      hightlightNode,
      hightlightTag,
      selectTag,
    } = this.state;

    let node = this.nodesG.selectAll('.node')
      .data(nodes, (d) => d.id);

    const nodeEnter = node.enter().append('g')
      .classed('node', true)
      .on('mouseover', this.highlight)
      .on('mouseleave', this.unhighlight)
      .on('click', this.select);

    nodeEnter.append('circle')
      .attr('class', 'node-circle');

    node.exit().remove();

    node = node.merge(nodeEnter);
    node.attr('transform', (d) => (d.x ? `translate(${d.x}, ${d.y})` : null))

    node.transition()
      .duration(transitionTime)
      .attr('opacity', (d) => {
        if (hightlightTag) {
          if (d.tags.includes(hightlightTag)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        if (selectTag) {
          if (d.tags.includes(selectTag)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        if (hightlightNode) {
          if (hightlightNode === d || hightlightNode.linked.has(d)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        return 1
      });

    node.select('.node-circle')
      .attr('r', nodeRadius)
      .attr('fill', d => {
        if(hightlightNode && hightlightNode === d) {
          return `url(#${d.id}-gif)`
        }
        return `url(#${d.id}-img)`;
      })
      .attr('stroke', '#e2e2e2')
      .attr('cursor', 'pointer')
      .attr('stroke-width', 1.0);

  }

  renderTitles() {
    const nodes = this.getNodes();

    const {
      nodeRadius
    } = this.props;

    const {
      hightlightNode,
      hightlightTag,
      selectTag,
    } = this.state;

    let title = this.titlesG.selectAll('.node-text')
      .data(nodes, (d) => d.id);

    const titleEnter = title.enter()
      .append('text')
      .attr('class', 'node-text')
      .attr('pointer-events', 'none');

    titleEnter
      .append('tspan')
      .attr('class', 'name')
      .tspans(d => d.name.split('\n'));

    titleEnter
      .append('tspan')
      .attr('class', 'title')
      .tspans(d => d.title.split('\n'));


    title.exit().remove();

    title = title.merge(titleEnter)
      .attr('transform', (d) => (d.x ? `translate(${d.x}, ${d.y})` : null))
      .attr('text-anchor', 'middle')
      // .attr('pointer-events', 'none')
      .attr('fill', 'white')
      .attr('y', nodeRadius + 10);

    title.transition()
      .duration(transitionTime)
      .attr('opacity', (d) => {
        if (hightlightTag) {
          if (d.tags.includes(hightlightTag)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        if (selectTag) {
          if (d.tags.includes(selectTag)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        if (hightlightNode) {
          if (hightlightNode === d || hightlightNode.linked.has(d)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        return 1
      });

    title.select('.name')
      .attr('x', 0)
      .attr('dy', 10)
      .text((d) => d.name);

    title.select('.title')
      .attr('x', 0)
      .attr('y', 60 + 20)
  }

  renderEdges() {
    const edges = this.simulationLinks;

    const {
      hightlightNode,
      hightlightTag,
      selectTag,
    } = this.state;

    let edge = this.edgesG.selectAll('.edge')
      .data(edges, (d) => d.source.id + d.target.id);

    const edgeEnter = edge.enter()
      .append('line')
      .attr('class', 'edge');

    edge.exit().remove();

    edge = edge.merge(edgeEnter)
      .style('stroke-width', 2)
      .style('stroke', '#D39F4C')
      .style('stroke-dasharray', ('3, 6'))
      .attr('pointer-events', 'none')
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    edge.transition()
      .duration(transitionTime)
      .attr('opacity', (d) => {
        if (hightlightTag) {
          if (d.source.tags.includes(hightlightTag) && d.target.tags.includes(hightlightTag)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        if (selectTag) {
          if (d.source.tags.includes(selectTag) && d.target.tags.includes(selectTag)) {
            return 1;
          } else {
            return 0.1;
          }
        }

        if (hightlightNode) {
          if (hightlightNode === d.source || hightlightNode === d.target) {
            return .8;
          } else {
            return 0.1;
          }
        }

        return 0.8
      });
  }

  renderTagHulls() {
    const {
      hightlightTag,
      selectTag,
    } = this.state;

    const nodes = this.getNodes();
    let tags = uniq(flatten(nodes.map(d => d.tags))).sort();

    let tagHull = this.hullsG.selectAll('.tagHull')
      .data(tags, (d) => d);

    const tagHullEnter = tagHull.enter().append('g')
      .classed('tagHull', true)

    tagHullEnter.append('path')
      .attr('class', 'tag-hull-path')
      // .style('opacity', 0);

    tagHull.exit()
      .transition().duration(100)
        .style('opacity', 0)
      .remove();

    tagHull = tagHull.merge(tagHullEnter);

    const line = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRomClosed.alpha(0.3))




    tagHull.select('.tag-hull-path')
      .attr('d', (d) => {
        const hullPoints = this.getHull(d, nodes);
        if (hullPoints) {
          return line(hullPoints)
        }
      })
      .attr('stroke-width', 1.0);

    tagHull.select('.tag-hull-path')
      .transition()
      .duration(transitionTime)
        .attr('stroke', 'white')
        // .attr('fill', '#D39F4C')
        .attr('fill', (d) => `url(#${d.id}-grad)`)
        .style('fill-opacity', (d) => {
          if (selectTag && d === selectTag) {
            return 0.9;
          }

          if (hightlightTag && d === hightlightTag) {
            return 0.9;
          }
          return 0.0;

          // if (hightlightNode) {
          //   if(hightlightNode.tags.includes(d)) {
          //     return 1
          //   } else {
          //     return 0.0;
          //   }
          // } else {
          //   return 0.03;
          // }
        })
      .style('stroke-opacity', (d) => {
        if (selectTag && d === selectTag) {
          return 0.0;
        }

        if (hightlightTag && d === hightlightTag) {
          return 0.0;
        }

        // if (hightlightNode && hightlightNode.tags.includes(d)) {
        //   return 0.1;
        // }
        // if (hightlightNode) {
        //   return 0;
        // }

        return 0.04;
      })


  }

  renderTagList() {
    const {
      hightlightTag,
      selectTag
    } = this.state;

    const nodes = this.getNodes();
    const tags = uniq(flatten(nodes.map(d => d.tags))).sort();
    return (
      <div className='tag-list'>
        {tags.map(t => {
          return (
            <div
              key={`${t}-tag`}
              className={`tag ${hightlightTag === t ? 'higlighted' : ''} ${selectTag === t ? 'selected' : ''}`}
              onMouseEnter={() => this.hoverTag(t)}
              onMouseLeave={this.unHoverTag}
              onClick={() => this.toggleSelectTag(t)}
            >
              {t}
            </div>
          )
        })}
      </div>
    )
  }


  render() {
    const {
      width,
      height,
      padding,
    } = this.props;

    return (
      <div className='NetworkView' ref={node =>  this.container = node }>
          {this.renderTagList()}
          <svg
            width={width}
            height={height}
            ref={(node) => { this.svg = node; }}
          >
            <g
              transform={`translate(${padding.left} ${padding.top})`}
              ref={(node) => { this.g = node; }}
            />
          </svg>
          <p className='blurb'>Speaker connections based on similarity of talk transcrips</p>
      </div>
    )
  }
}
