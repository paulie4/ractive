import { fatal, welcome } from 'utils/log';
import { missingPlugin } from 'config/errors';
import { magic as magicSupported } from 'config/environment';
import { ensureArray } from 'utils/array';
import { findInViewHierarchy } from 'shared/registry';
import arrayAdaptor from 'Ractive/static/adaptors/array/index';
import magicAdaptor from 'Ractive/static/adaptors/magic';
import magicArrayAdaptor from 'Ractive/static/adaptors/magicArray';
import { create, defineProperty, extend } from 'utils/object';
import dataConfigurator from 'Ractive/config/custom/data';
import Viewmodel from 'viewmodel/Viewmodel';
import Hook from 'events/Hook';
import getComputationSignature from './helpers/getComputationSignature';
import Ractive from '../Ractive';

const constructHook = new Hook( 'construct' );

const registryNames = [
	'adaptors',
	'components',
	'decorators',
	'easing',
	'events',
	'interpolators',
	'partials',
	'transitions'
];

let uid = 0;

export default function construct ( ractive, userOptions, options ) {
	if ( Ractive.DEBUG ) welcome();

	initialiseProperties( ractive, options );

	// TODO remove this, eventually
	defineProperty( ractive, 'data', { get: deprecateRactiveData });

	// TODO don't allow `onconstruct` with `new Ractive()`, there's no need for it
	constructHook.fire( ractive, userOptions );

	// Add registries
	registryNames.forEach( name => {
		ractive[ name ] = extend( create( ractive.constructor[ name ] || null ), userOptions[ name ] );
	});

	// Create a viewmodel
	const viewmodel = new Viewmodel({
		adapt: getAdaptors( ractive, ractive.adapt, userOptions ),
		data: dataConfigurator.init( ractive.constructor, ractive, userOptions ),
		ractive
	});

	ractive.viewmodel = viewmodel;

	// Add computed properties
	const computed = extend( create( ractive.constructor.prototype.computed ), userOptions.computed );

	Object.keys( computed ).forEach( key => {
		const signature = getComputationSignature( ractive, key, computed[ key ] );
		const computation = viewmodel.compute( key, signature );
		computation.init();
	});
}

function combine ( a, b ) {
	var c = a.slice(), i = b.length;

	while ( i-- ) {
		if ( !~c.indexOf( b[i] ) ) {
			c.push( b[i] );
		}
	}

	return c;
}

function getAdaptors ( ractive, protoAdapt, userOptions ) {
	var adapt, magic, modifyArrays;

	protoAdapt = protoAdapt.map( lookup );
	adapt = ensureArray( userOptions.adapt ).map( lookup );

	adapt = combine( protoAdapt, adapt );

	magic = 'magic' in userOptions ? userOptions.magic : ractive.magic;
	modifyArrays = 'modifyArrays' in userOptions ? userOptions.modifyArrays : ractive.modifyArrays;

	if ( magic ) {
		if ( !magicSupported ) {
			throw new Error( 'Getters and setters (magic mode) are not supported in this browser' );
		}

		if ( modifyArrays ) {
			adapt.push( magicArrayAdaptor );
		}

		adapt.push( magicAdaptor );
	}

	if ( modifyArrays ) {
		adapt.push( arrayAdaptor );
	}

	return adapt;


	function lookup ( adaptor ) {
		if ( typeof adaptor === 'string' ) {
			adaptor = findInViewHierarchy( 'adaptors', ractive, adaptor );

			if ( !adaptor ) {
				fatal( missingPlugin( adaptor, 'adaptor' ) );
			}
		}

		return adaptor;
	}
}

function initialiseProperties ( ractive, options ) {
	// Generate a unique identifier, for places where you'd use a weak map if it
	// existed
	ractive._guid = 'r-' + uid++;

	// events
	ractive._subs = create( null );

	// storage for item configuration from instantiation to reset,
	// like dynamic functions or original values
	ractive._config = {};

	// animations (so we can stop any in progress at teardown)
	ractive._animations = [];

	// nodes registry
	ractive.nodes = {};

	// events
	ractive.event = null;
	ractive._eventQueue = [];

	// live queries
	ractive._liveQueries = [];
	ractive._liveComponentQueries = [];

	// bound data functions
	ractive._boundFunctions = [];

	// observers
	ractive._observers = [];


	// properties specific to inline components
	if ( options.component ) {
		ractive.parent = options.parent;
		ractive.container = options.container || null;
		ractive.root = ractive.parent.root;

		ractive.component = options.component;
		options.component.instance = ractive;

		// for hackability, this could be an open option
		// for any ractive instance, but for now, just
		// for components and just for ractive...
		ractive._inlinePartials = options.inlinePartials;
	} else {
		ractive.root = ractive;
		ractive.parent = ractive.container = null;
	}
}

function deprecateRactiveData () {
	throw new Error( 'Using `ractive.data` is no longer supported - you must use the `ractive.get()` API instead' );
}