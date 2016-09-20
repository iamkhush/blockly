/**
 * @license
 * Visual Blocks Language
 *
 * Copyright 2012 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Helper functions for generating Cplus for blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.Cplus');

goog.require('Blockly.Generator');


/**
 * Cplus code generator.
 * @type {!Blockly.Generator}
 */
Blockly.Cplus = new Blockly.Generator('Cplus');

/**
 * List of illegal variable names.
 * This is not intended to be a security feature.  Blockly is 100% client-side,
 * so bypassing this list is trivial.  This is intended to prevent users from
 * accidentally clobbering a built-in object or function.
 * @private
 */
Blockly.Cplus.addReservedWords(
  // http://en.cppreference.com/w/cpp/keyword
  'alignas,alignof,and,and_eq,asm,atomic_cancel,atomic_commit,atomic_noexcept,auto,bitand,bitor',
  'bool,break,case,catch,char,char16_t,char32_t,class,compl,concept,const,constexpr,const_cast',
  'continue,decltype,default,delete,do,double,dynamic_cast,else,enum,explicit,export,extern',
  'false,float,for,friend,goto,if,inline,int,import,long,module,mutable,namespace,new,noexcept',
  'not,not_eq,nullptr,operator,or,or_eq,private,protected,public,register,reinterpret_cast',
  'requires,return,short,signed,sizeof,static,static_assert,static_cast,struct,switch',
  'synchronized,template,this,thread_local,throw,true,try,typedef,typeid,typename,union',
  'unsigned,using,virtual,void,volatile,wchar_t,while,xor,xor_eq'
)

/**
 * Initialise the database of variable names.
 * @param {!Blockly.Workspace} workspace Workspace to generate code from.
 */
Blockly.Cplus.init = function(workspace) {
  /**
   * Empty loops or conditionals are not allowed in Cplus.
   */
  Blockly.Cplus.PASS = this.INDENT + 'pass\n';
  // Create a dictionary of definitions to be printed before the code.
  Blockly.Cplus.definitions_ = Object.create(null);
  // Create a dictionary mapping desired function names in definitions_
  // to actual function names (to avoid collisions with user functions).
  Blockly.Cplus.functionNames_ = Object.create(null);

  if (!Blockly.Cplus.variableDB_) {
    Blockly.Cplus.variableDB_ =
        new Blockly.Names(Blockly.Cplus.RESERVED_WORDS_);
  } else {
    Blockly.Cplus.variableDB_.reset();
  }

  var defvars = [];
  var variables = workspace.variableList;
  for (var i = 0; i < variables.length; i++) {
    defvars[i] = Blockly.Cplus.variableDB_.getName(variables[i],
        Blockly.Variables.NAME_TYPE) + ' = None';
  }
  Blockly.Cplus.definitions_['variables'] = defvars.join('\n');
};

/**
 * Prepend the generated code with the variable definitions.
 * @param {string} code Generated code.
 * @return {string} Completed code.
 */
Blockly.Cplus.finish = function(code) {
  if (code) {
    code = Blockly.Cplus.prefixLines(code, Blockly.Cplus.INDENT);
  }
  code = 'main() {\n' + code + '}';
  
  // Convert the definitions dictionary into a list.
  var imports = [];
  var definitions = [];
  for (var name in Blockly.Cplus.definitions_) {
    var def = Blockly.Cplus.definitions_[name];
    if (def.match(/^(from\s+\S+\s+)?import\s+\S+/)) {
      imports.push(def);
    } else {
      definitions.push(def);
    }
  }
  // Clean up temporary data.
  delete Blockly.Cplus.definitions_;
  delete Blockly.Cplus.functionNames_;
  Blockly.Cplus.variableDB_.reset();
  var allDefs = imports.join('\n') + '\n\n' + definitions.join('\n\n');
  return allDefs.replace(/\n\n+/g, '\n\n').replace(/\n*$/, '\n\n\n') + code;
};

/**
 * Naked values are top-level blocks with outputs that aren't plugged into
 * anything.
 * @param {string} line Line of generated code.
 * @return {string} Legal line of code.
 */
Blockly.Cplus.scrubNakedValue = function(line) {
  return line + '\n';
};

/**
 * Encode a string as a properly escaped Cplus string, complete with quotes.
 * @param {string} string Text to encode.
 * @return {string} Cplus string.
 * @private
 */
Blockly.Cplus.quote_ = function(string) {
  // Can't use goog.string.quote since % must also be escaped.
  string = string.replace(/\\/g, '\\\\')
                 .replace(/\n/g, '\\\n')
                 .replace(/\%/g, '\\%')
                 .replace(/'/g, '\\\'');
  return '\'' + string + '\'';
};

/**
 * Common tasks for generating Cplus from blocks.
 * Handles comments for the specified block and any connected value blocks.
 * Calls any statements following this block.
 * @param {!Blockly.Block} block The current block.
 * @param {string} code The Cplus code created for this block.
 * @return {string} Cplus code with comments and subsequent blocks added.
 * @private
 */
Blockly.Cplus.scrub_ = function(block, code) {
  var commentCode = '';
  // Only collect comments for blocks that aren't inline.
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    // Collect comment for this block.
    var comment = block.getCommentText();
    comment = Blockly.utils.wrap(comment, Blockly.Cplus.COMMENT_WRAP - 3);
    if (comment) {
      if (block.getProcedureDef) {
        // Use a comment block for function comments.
        commentCode += '"""' + comment + '\n"""\n';
      } else {
        commentCode += Blockly.Cplus.prefixLines(comment + '\n', '# ');
      }
    }
    // Collect comments for all value arguments.
    // Don't collect comments for nested statements.
    for (var i = 0; i < block.inputList.length; i++) {
      if (block.inputList[i].type == Blockly.INPUT_VALUE) {
        var childBlock = block.inputList[i].connection.targetBlock();
        if (childBlock) {
          var comment = Blockly.Cplus.allNestedComments(childBlock);
          if (comment) {
            commentCode += Blockly.Cplus.prefixLines(comment, '# ');
          }
        }
      }
    }
  }
  var nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  var nextCode = Blockly.Cplus.blockToCode(nextBlock);
  return commentCode + code + nextCode;
};

/**
 * Gets a property and adjusts the value, taking into account indexing, and
 * casts to an integer.
 * @param {!Blockly.Block} block The block.
 * @param {string} atId The property ID of the element to get.
 * @param {number=} opt_delta Value to add.
 * @param {boolean=} opt_negate Whether to negate the value.
 * @return {string|number}
 */
Blockly.Cplus.getAdjustedInt = function(block, atId, opt_delta, opt_negate) {
  var delta = opt_delta || 0;
  if (Blockly.Cplus.ONE_BASED_INDEXING) {
    delta--;
  }
  var defaultAtIndex = Blockly.Cplus.ONE_BASED_INDEXING ? '1' : '0';
  var atOrder = delta ? Blockly.Cplus.ORDER_ADDITIVE :
      Blockly.Cplus.ORDER_NONE;
  var at = Blockly.Cplus.valueToCode(block, atId, atOrder) || defaultAtIndex;

  if (Blockly.isNumber(at)) {
    // If the index is a naked number, adjust it right now.
    at = parseInt(at, 10) + delta;
    if (opt_negate) {
      at = -at;
    }
  } else {
    // If the index is dynamic, adjust it in code.
    if (delta > 0) {
      at = 'int(' + at + ' + ' + delta + ')';
    } else if (delta < 0) {
      at = 'int(' + at + ' - ' + -delta + ')';
    } else {
      at = 'int(' + at + ')';
    }
    if (opt_negate) {
      at = '-' + at;
    }
  }
  return at;
};