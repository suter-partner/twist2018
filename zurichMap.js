

function zurichMap(filename) {
  renderZurichMap(d3, topojson, sszvis, filename);
}

$(document).ready(function () {
  zurichMap('data1.csv');
}
);


function renderZurichMap(d3, topojson, sszvis, filename) {
  'use strict';




  if (sszvis.fallbackUnsupported()) {
    sszvis.fallbackRender('#sszvis-chart');
    return;
  }


  /* Configuration
  ----------------------------------------------- */
  var TITLE = 'Diagrammtitel';
  var DESCRIPTION = 'Kurze Beschreibung des Inhalts dieses Diagramms';
  var INITIAL_YEAR = '2018';
  var MAX_LEGEND_WIDTH = 320;
  var queryProps = sszvis.responsiveProps()
    .prop('bounds', {
      _: function(width) {
        var innerHeight = sszvis.aspectRatioSquare(width);
        return {
          top: -3,
          bottom: 0,
          height: 80 + innerHeight + 90
        }
      }
    })
    .prop('legendWidth', {
      _: function(width) {
        return Math.min(width / 2, MAX_LEGEND_WIDTH);
      }
    })
    .prop('controlWidth', {
      _: function(width) {
        return Math.max(200, Math.min(MAX_LEGEND_WIDTH, width / 2));
      }
    });


  /* Shortcuts
  ----------------------------------------------- */
  var vAcc = sszvis.prop('value');
  var yAcc = sszvis.prop('year');
  var qnameAcc = sszvis.prop('quartername');
  var mDatumAcc = sszvis.prop('datum');


  /* Application state
  ----------------------------------------------- */
  var state = {
    data: null,
    mapData: null,
    valueDomain: [0, 0],
    years: [],
    currentYear: null,
    currentMapData: [],
    selection: []
  };


  /* State transitions
  ----------------------------------------------- */
  var actions = {
    prepareState: function(data) {
      //console.log(sparqlData)
      //console.log(data)
      //data = sparqlData;
      state.data = data;
      state.valueDomain = [0, d3.max(state.data, vAcc)];
      state.years = sszvis.set(state.data, yAcc).sort(d3.ascending);

      actions.setYear(INITIAL_YEAR);
    },

    prepareMapData: function(topo) {
      state.mapData = {
        features: topojson.feature(topo, topo.objects.statistische_quartiere),
        borders: topojson.mesh(topo, topo.objects.statistische_quartiere),
        lakeFeatures: topojson.feature(topo, topo.objects.lakezurich),
        lakeBorders: topojson.mesh(topo, topo.objects.statistische_quartiere_lakebounds),
      }
      render(state);
    },


    // this function switches the active year
    setYear: function(y) {
      state.currentYear = y;
      // filter the data to match the selected year
      state.currentMapData = state.data.filter(function(v) {
        return yAcc(v) === state.currentYear;
      });
      render(state);
    },

    selectHovered: function(d) {
      state.selection = [d.datum];
      render(state);
    },

    deselectHovered: function() {
      state.selection = [];
      render(state);
    },

    resize: function() { render(state); }
  };


  /* Data initialization
  ----------------------------------------------- */

  function loadFileData(filename) {
  d3.csv(filename)
    .row(function(d) {
      return {
        quarternum: sszvis.parseNumber(d['Qcode']),
        quartername: d['Qname'],
        value: sszvis.parseNumber(d['val']),
        year: d['Jahr']
      };
    })
    .get(function(error, data) {
      if (error) {
        sszvis.loadError(error);
        return;
      }
      actions.prepareState(data);
    });
  }

  loadFileData(filename);
  //actions.prepareState(jsonData);

  d3.json('topo/stadt-zurich.json')
    .get(function(error, data) {
      if (error) {
        sszvis.loadError(error);
        return;
      }
      actions.prepareMapData(data);
    });


  /* Render
  ----------------------------------------------- */
  function render(state) {
    if (state.data === null || state.mapData === null) {
      // loading ...
      return true;
    }

    var props = queryProps(sszvis.measureDimensions('#sszvis-chart'));
    var bounds = sszvis.bounds(props.bounds, '#sszvis-chart');


    // Scales

    var colorScale = sszvis.scaleSeqBlu()
      .domain(state.valueDomain);


    // Layers

    var chartLayer = sszvis.createSvgLayer('#sszvis-chart', bounds, {
        title: TITLE,
        description: DESCRIPTION
      })
      .datum(state.currentMapData);

    var htmlLayer = sszvis.createHtmlLayer('#sszvis-chart', bounds);

    var tooltipLayer = sszvis.createHtmlLayer('#sszvis-chart', bounds)
      .datum(state.selection);


    // Components

    var control = sszvis.buttonGroup()
      .values(state.years)
      .width(0)
      //.current(state.currentYear)
      .change(actions.setYear);

    var choroplethMap = sszvis.choropleth()
      .features(state.mapData.features)
      .borders(state.mapData.borders)
      .lakeFeatures(state.mapData.lakeFeatures)
      .lakeBorders(state.mapData.lakeBorders)
      .keyName('quarternum')
      .highlight(state.selection)
      .highlightStroke(function(d) {
        // checks for undefined values and makes those white
        var v = vAcc(d);
        return isNaN(v) ? 'white' : sszvis.muchDarker(colorScale(vAcc(d)));
      })
      .strokeWidth(sszvis.widthAdaptiveMapPathStroke(bounds.width))
      .highlightStrokeWidth(sszvis.widthAdaptiveMapPathStroke(bounds.width) + 1)
      .width(bounds.innerWidth)
      .height(bounds.innerHeight)
      .defined(function(d) {
        // some of the values are empty in the .csv file. When parsed as a number,
        // undefined or empty string values become NaN
        return !isNaN(vAcc(d));
      })
      .fill(sszvis.compose(colorScale, vAcc));

    // see the comment by the tooltip in docs/map-standard/kreis.html for more information
    // about accesing data properties of map entities.
    var tooltipHeader = sszvis.modularTextHTML()
      .bold(sszvis.compose(function(v) {
        return isNaN(v) ? 'keine Daten' : sszvis.formatPercent(Math.round(v * 100));
      }, vAcc, mDatumAcc));

    var tooltip = sszvis.tooltip()
      .renderInto(tooltipLayer)
      .header(tooltipHeader)
      .body(sszvis.compose(qnameAcc, mDatumAcc))
      .orientation(sszvis.fitTooltip('bottom', bounds))
      .visible(isSelected);

    var legend = sszvis.legendColorLinear()
      .scale(colorScale)
      .width(props.legendWidth)
      .labelFormat(sszvis.formatFractionPercent);


    // Rendering

    chartLayer
      .attr('transform', sszvis.translateString(bounds.padding.left, bounds.padding.top))
      .call(choroplethMap);

    chartLayer.selectAll('[data-tooltip-anchor]')
      .call(tooltip);

    chartLayer.selectGroup('legend')
      .attr('transform', sszvis.translateString(bounds.width/2 - props.legendWidth/2, bounds.innerHeight + 60))
      .call(legend);

    htmlLayer.selectDiv('controls')
      .style('left', ((bounds.width - props.controlWidth) / 2) + 'px')
      .style('top', (20 - bounds.padding.top) + 'px')
      .call(control);


    // Interaction

    var interactionLayer = sszvis.panning()
      .elementSelector('.sszvis-map__area')
      .on('start', actions.selectHovered)
      .on('pan', actions.selectHovered)
      .on('end', actions.deselectHovered);

    chartLayer
      .call(interactionLayer);

    sszvis.viewport.on('resize', actions.resize);
  }

  function isSelected(d) {
    return state.selection.indexOf(d.datum) >= 0;
  }

}


